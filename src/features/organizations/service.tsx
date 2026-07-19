import mongoose from "mongoose";
import { nanoid } from "nanoid";

import { consumeAuthToken, issueAuthToken } from "@/features/auth/tokens";
import {
  BUILT_IN_ROLES,
  PERMISSIONS,
  type Permission,
} from "@/features/organizations/permissions";
import {
  createOrganizationSchema,
  invitationSchema,
  transferOwnershipSchema,
  updateMemberSchema,
} from "@/features/organizations/schemas";
import { writeAudit } from "@/server/audit";
import {
  requireOrganizationPermission,
  type AuthorizedUser,
} from "@/server/authorization";
import {
  AuthTokenModel,
  InvitationModel,
  OrganizationMemberModel,
  OrganizationModel,
  RoleModel,
  UserModel,
} from "@/server/db/models";
import { connectMongoose } from "@/server/db/mongodb";
import { sendTransactionalEmail } from "@/server/email/send";
import { OrganizationInvitationEmail } from "@/server/email/templates/organization-invitation-email";
import { getServerEnv } from "@/server/env";
import { AppError } from "@/server/security/errors";
import type { RequestContext } from "@/server/security/request";

function makeSlug(name: string): string {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return `${base || "organization"}-${nanoid(8).toLowerCase()}`;
}

function toId(value: unknown): string {
  return String(value);
}

function assertRoleCanBeGranted(
  actorPermissions: readonly string[],
  targetPermissions: readonly string[],
): void {
  if (
    targetPermissions.some(
      (permission) => !actorPermissions.includes(permission),
    )
  ) {
    throw new AppError(
      403,
      "ROLE_ESCALATION",
      "You cannot grant a role with permissions you do not hold.",
    );
  }
}

export async function createOrganization(
  rawInput: unknown,
  user: AuthorizedUser,
  context: RequestContext,
) {
  const input = createOrganizationSchema.parse(rawInput);
  await connectMongoose();

  const organization = await mongoose.connection.transaction(
    async (session) => {
      const created = (
        await OrganizationModel.create(
          [
            {
              name: input.name,
              slug: makeSlug(input.name),
              createdBy: user.id,
              updatedBy: user.id,
            },
          ],
          { session },
        )
      )[0];
      const roles = await RoleModel.insertMany(
        BUILT_IN_ROLES.map((role) => ({
          organizationId: created._id,
          key: role.key,
          name: role.name,
          permissions: [...role.permissions],
          isSystem: true,
          createdBy: user.id,
          updatedBy: user.id,
        })),
        { session },
      );
      const ownerRole = roles.find((role) => role.key === "owner");
      if (!ownerRole) throw new Error("Owner role was not created");
      await OrganizationMemberModel.create(
        [
          {
            organizationId: created._id,
            userId: user.id,
            roleId: ownerRole._id,
            joinedAt: new Date(),
            updatedBy: user.id,
          },
        ],
        { session },
      );
      return {
        id: created._id.toString(),
        name: created.name,
        slug: created.slug,
        status: created.status,
        version: created.__v,
      };
    },
  );

  await writeAudit({
    organizationId: organization.id,
    actorUserId: user.id,
    action: "organization.created",
    targetType: "organization",
    targetId: organization.id,
    requestId: context.requestId,
    ipHash: context.ipHash,
  });
  return organization;
}

export async function listOrganizations(userId: string) {
  await connectMongoose();
  const memberships = await OrganizationMemberModel.find({
    userId,
    status: "active",
  }).lean();
  const organizationIds = memberships.map(
    (membership) => membership.organizationId,
  );
  const [organizations, roles] = await Promise.all([
    OrganizationModel.find({ _id: { $in: organizationIds }, status: "active" })
      .sort({ name: 1 })
      .lean(),
    RoleModel.find({
      _id: { $in: memberships.map((membership) => membership.roleId) },
      organizationId: { $in: organizationIds },
    }).lean(),
  ]);
  const roleById = new Map(roles.map((role) => [toId(role._id), role]));
  const membershipByOrganization = new Map(
    memberships.map((membership) => [
      toId(membership.organizationId),
      membership,
    ]),
  );

  return organizations.map((organization) => {
    const membership = membershipByOrganization.get(toId(organization._id));
    const role = membership ? roleById.get(toId(membership.roleId)) : undefined;
    return {
      id: toId(organization._id),
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      role: role
        ? { id: toId(role._id), key: role.key, name: role.name }
        : null,
      createdAt: organization.createdAt,
      version: organization.__v,
    };
  });
}

export async function getOrganization(organizationId: string, userId: string) {
  const access = await requireOrganizationPermission(
    userId,
    organizationId,
    PERMISSIONS.ORGANIZATION_READ,
  );
  const organization = await OrganizationModel.findOne({
    _id: organizationId,
    status: "active",
  }).lean();
  if (!organization)
    throw new AppError(
      404,
      "ORGANIZATION_NOT_FOUND",
      "The organization was not found.",
    );
  return {
    id: toId(organization._id),
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
    role: {
      id: toId(access.role._id),
      key: access.role.key,
      name: access.role.name,
      permissions: access.role.permissions,
    },
    createdAt: organization.createdAt,
    version: organization.__v,
  };
}

export async function listMembers(organizationId: string, userId: string) {
  await requireOrganizationPermission(
    userId,
    organizationId,
    PERMISSIONS.MEMBER_LIST,
  );
  const members = await OrganizationMemberModel.find({
    organizationId,
    status: { $in: ["active", "suspended"] },
  })
    .sort({ joinedAt: 1 })
    .lean();
  const [users, roles] = await Promise.all([
    UserModel.find({ _id: { $in: members.map((member) => member.userId) } })
      .select("name email image status")
      .lean(),
    RoleModel.find({
      organizationId,
      _id: { $in: members.map((member) => member.roleId) },
    }).lean(),
  ]);
  const userById = new Map(
    users.map((memberUser) => [toId(memberUser._id), memberUser]),
  );
  const roleById = new Map(roles.map((role) => [toId(role._id), role]));
  return members.map((member) => {
    const memberUser = userById.get(toId(member.userId));
    const role = roleById.get(toId(member.roleId));
    return {
      id: toId(member._id),
      user: memberUser
        ? {
            id: toId(memberUser._id),
            name: memberUser.name,
            email: memberUser.email,
            image: memberUser.image,
          }
        : null,
      role: role
        ? { id: toId(role._id), key: role.key, name: role.name }
        : null,
      status: member.status,
      joinedAt: member.joinedAt,
      version: member.__v,
    };
  });
}

export async function listRoles(organizationId: string, userId: string) {
  await requireOrganizationPermission(
    userId,
    organizationId,
    PERMISSIONS.ROLE_LIST,
  );
  const roles = await RoleModel.find({ organizationId })
    .sort({ name: 1 })
    .lean();
  return roles.map((role) => ({
    id: toId(role._id),
    key: role.key,
    name: role.name,
    permissions: role.permissions,
    system: role.isSystem,
    version: role.__v,
  }));
}

export async function inviteMember(
  organizationId: string,
  rawInput: unknown,
  user: AuthorizedUser,
  context: RequestContext,
) {
  const input = invitationSchema.parse(rawInput);
  const access = await requireOrganizationPermission(
    user.id,
    organizationId,
    PERMISSIONS.MEMBER_INVITE,
  );
  const [organization, role, inviter] = await Promise.all([
    OrganizationModel.findOne({ _id: organizationId, status: "active" }),
    RoleModel.findOne({ _id: input.roleId, organizationId }),
    UserModel.findById(user.id).select("name"),
  ]);
  if (!organization)
    throw new AppError(
      404,
      "ORGANIZATION_NOT_FOUND",
      "The organization was not found.",
    );
  if (!role)
    throw new AppError(400, "INVALID_ROLE", "The selected role is invalid.");
  assertRoleCanBeGranted(access.role.permissions, role.permissions);

  const existingUser = await UserModel.findOne({ email: input.email }).select(
    "_id",
  );
  if (existingUser) {
    const member = await OrganizationMemberModel.exists({
      organizationId,
      userId: existingUser._id,
      status: { $ne: "removed" },
    });
    if (member)
      throw new AppError(
        409,
        "ALREADY_MEMBER",
        "This person is already a member.",
      );
  }

  const result = await mongoose.connection.transaction(async (session) => {
    await InvitationModel.updateMany(
      { organizationId, email: input.email, status: "pending" },
      { $set: { status: "revoked", revokedAt: new Date() } },
      { session },
    );
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
    const invitation = (
      await InvitationModel.create(
        [
          {
            organizationId,
            email: input.email,
            roleId: role._id,
            invitedBy: user.id,
            expiresAt,
          },
        ],
        { session },
      )
    )[0];
    const token = await issueAuthToken({
      type: "invitation",
      identifier: input.email,
      organizationId,
      invitationId: invitation._id,
      createdBy: user.id,
      expiresAt,
      session,
    });
    return { id: invitation._id.toString(), token, expiresAt };
  });

  const acceptUrl = new URL("/invitations/accept", getServerEnv().APP_URL);
  acceptUrl.searchParams.set("token", result.token);
  await sendTransactionalEmail({
    to: input.email,
    subject: `You were invited to ${organization.name}`,
    template: "organization_invitation",
    react: (
      <OrganizationInvitationEmail
        acceptUrl={acceptUrl.toString()}
        organizationName={organization.name}
        inviterName={inviter?.name || user.email}
        roleName={role.name}
        expiresIn="7 days"
      />
    ),
    organizationId,
  });
  await writeAudit({
    organizationId,
    actorUserId: user.id,
    action: "organization.member_invited",
    targetType: "invitation",
    targetId: result.id,
    requestId: context.requestId,
    ipHash: context.ipHash,
    metadata: { roleId: role._id.toString() },
  });
  return {
    id: result.id,
    email: input.email,
    role: { id: role._id.toString(), name: role.name },
    expiresAt: result.expiresAt,
  };
}

export async function listInvitations(organizationId: string, userId: string) {
  await requireOrganizationPermission(
    userId,
    organizationId,
    PERMISSIONS.MEMBER_LIST,
  );
  const invitations = await InvitationModel.find({ organizationId })
    .sort({ createdAt: -1 })
    .lean();
  const roles = await RoleModel.find({
    organizationId,
    _id: { $in: invitations.map((invitation) => invitation.roleId) },
  }).lean();
  const roleById = new Map(roles.map((role) => [toId(role._id), role]));
  return invitations.map((invitation) => {
    const role = roleById.get(toId(invitation.roleId));
    const effectiveStatus =
      invitation.status === "pending" && invitation.expiresAt <= new Date()
        ? "expired"
        : invitation.status;
    return {
      id: toId(invitation._id),
      email: invitation.email,
      status: effectiveStatus,
      role: role
        ? { id: toId(role._id), key: role.key, name: role.name }
        : null,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      version: invitation.__v,
    };
  });
}

export async function acceptInvitation(
  tokenValue: string,
  user: AuthorizedUser,
  context: RequestContext,
) {
  await connectMongoose();
  const result = await mongoose.connection.transaction(async (session) => {
    const token = await consumeAuthToken(tokenValue, "invitation", session);
    if (
      !token?.invitationId ||
      !token.organizationId ||
      token.identifier !== user.email
    ) {
      throw new AppError(
        400,
        "INVALID_INVITATION",
        "This invitation is invalid or expired.",
      );
    }
    const invitation = await InvitationModel.findOne({
      _id: token.invitationId,
      organizationId: token.organizationId,
      email: user.email,
      status: "pending",
      expiresAt: { $gt: new Date() },
    }).session(session);
    if (!invitation)
      throw new AppError(
        400,
        "INVALID_INVITATION",
        "This invitation is invalid or expired.",
      );
    const role = await RoleModel.findOne({
      _id: invitation.roleId,
      organizationId: invitation.organizationId,
    }).session(session);
    if (!role)
      throw new AppError(
        400,
        "INVALID_INVITATION",
        "This invitation is invalid or expired.",
      );

    const membership = await OrganizationMemberModel.findOneAndUpdate(
      { organizationId: invitation.organizationId, userId: user.id },
      {
        $set: {
          roleId: role._id,
          status: "active",
          joinedAt: new Date(),
          invitedBy: invitation.invitedBy,
          updatedBy: user.id,
          removedAt: null,
        },
      },
      {
        returnDocument: "after",
        upsert: true,
        session,
        setDefaultsOnInsert: true,
      },
    );
    invitation.status = "accepted";
    invitation.acceptedAt = new Date();
    invitation.acceptedBy = new mongoose.Types.ObjectId(user.id);
    await invitation.save({ session });
    return {
      organizationId: invitation.organizationId.toString(),
      membershipId: membership._id.toString(),
    };
  });

  await writeAudit({
    organizationId: result.organizationId,
    actorUserId: user.id,
    action: "organization.invitation_accepted",
    targetType: "membership",
    targetId: result.membershipId,
    requestId: context.requestId,
    ipHash: context.ipHash,
  });
  return result;
}

async function countActiveOwners(
  organizationId: string,
  session: mongoose.mongo.ClientSession,
): Promise<number> {
  const ownerRole = await RoleModel.findOne({
    organizationId,
    key: "owner",
  }).session(session);
  if (!ownerRole) return 0;
  return OrganizationMemberModel.countDocuments({
    organizationId,
    roleId: ownerRole._id,
    status: "active",
  }).session(session);
}

export async function changeMemberRole(
  organizationId: string,
  memberId: string,
  rawInput: unknown,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  const input = updateMemberSchema.parse(rawInput);
  const access = await requireOrganizationPermission(
    actor.id,
    organizationId,
    PERMISSIONS.MEMBER_UPDATE,
  );
  const targetRole = await RoleModel.findOne({
    _id: input.roleId,
    organizationId,
  });
  if (!targetRole)
    throw new AppError(400, "INVALID_ROLE", "The selected role is invalid.");
  assertRoleCanBeGranted(access.role.permissions, targetRole.permissions);

  const updated = await mongoose.connection.transaction(async (session) => {
    const membership = await OrganizationMemberModel.findOne({
      _id: memberId,
      organizationId,
      status: "active",
    }).session(session);
    if (!membership)
      throw new AppError(404, "MEMBER_NOT_FOUND", "The member was not found.");
    const currentRole = await RoleModel.findOne({
      _id: membership.roleId,
      organizationId,
    }).session(session);
    if (
      currentRole?.key === "owner" &&
      targetRole.key !== "owner" &&
      (await countActiveOwners(organizationId, session)) <= 1
    ) {
      throw new AppError(
        409,
        "LAST_OWNER",
        "The last owner cannot be demoted.",
      );
    }
    const result = await OrganizationMemberModel.findOneAndUpdate(
      { _id: membership._id, organizationId, __v: input.version },
      {
        $set: { roleId: targetRole._id, updatedBy: actor.id },
        $inc: { __v: 1 },
      },
      { returnDocument: "after", session },
    );
    if (!result)
      throw new AppError(
        409,
        "VERSION_CONFLICT",
        "The membership changed. Refresh and try again.",
      );
    return result;
  });

  await writeAudit({
    organizationId,
    actorUserId: actor.id,
    action: "organization.member_role_changed",
    targetType: "membership",
    targetId: memberId,
    requestId: context.requestId,
    ipHash: context.ipHash,
    metadata: { roleId: targetRole._id.toString() },
  });
  return {
    id: updated._id.toString(),
    roleId: targetRole._id.toString(),
    version: updated.__v,
  };
}

export async function removeMember(
  organizationId: string,
  memberId: string,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  await requireOrganizationPermission(
    actor.id,
    organizationId,
    PERMISSIONS.MEMBER_REMOVE,
  );
  await mongoose.connection.transaction(async (session) => {
    const membership = await OrganizationMemberModel.findOne({
      _id: memberId,
      organizationId,
      status: "active",
    }).session(session);
    if (!membership)
      throw new AppError(404, "MEMBER_NOT_FOUND", "The member was not found.");
    const role = await RoleModel.findOne({
      _id: membership.roleId,
      organizationId,
    }).session(session);
    if (
      role?.key === "owner" &&
      (await countActiveOwners(organizationId, session)) <= 1
    ) {
      throw new AppError(
        409,
        "LAST_OWNER",
        "The last owner cannot be removed.",
      );
    }
    membership.status = "removed";
    membership.removedAt = new Date();
    membership.updatedBy = new mongoose.Types.ObjectId(actor.id);
    await membership.save({ session });
  });
  await writeAudit({
    organizationId,
    actorUserId: actor.id,
    action: "organization.member_removed",
    targetType: "membership",
    targetId: memberId,
    requestId: context.requestId,
    ipHash: context.ipHash,
  });
}

export async function revokeInvitation(
  organizationId: string,
  invitationId: string,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  await requireOrganizationPermission(
    actor.id,
    organizationId,
    PERMISSIONS.MEMBER_INVITE,
  );
  await connectMongoose();
  const invitation = await mongoose.connection.transaction(async (session) => {
    const revoked = await InvitationModel.findOneAndUpdate(
      { _id: invitationId, organizationId, status: "pending" },
      { $set: { status: "revoked", revokedAt: new Date() } },
      { returnDocument: "after", session },
    );
    if (!revoked)
      throw new AppError(
        404,
        "INVITATION_NOT_FOUND",
        "The pending invitation was not found.",
      );
    await AuthTokenModel.updateMany(
      { invitationId: revoked._id, type: "invitation", usedAt: null },
      { $set: { usedAt: new Date() } },
      { session },
    );
    return revoked;
  });
  await writeAudit({
    organizationId,
    actorUserId: actor.id,
    action: "organization.invitation_revoked",
    targetType: "invitation",
    targetId: invitationId,
    requestId: context.requestId,
    ipHash: context.ipHash,
  });
  return { id: invitation._id.toString(), status: invitation.status };
}

export async function transferOwnership(
  organizationId: string,
  rawInput: unknown,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  const input = transferOwnershipSchema.parse(rawInput);
  const access = await requireOrganizationPermission(
    actor.id,
    organizationId,
    PERMISSIONS.MEMBER_UPDATE,
  );
  if (access.role.key !== "owner")
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only an owner can transfer ownership.",
    );
  if (access.membership._id.toString() === input.targetMemberId) {
    throw new AppError(
      400,
      "INVALID_OWNER",
      "Select a different active member.",
    );
  }
  await connectMongoose();
  await mongoose.connection.transaction(async (session) => {
    const [ownerRole, adminRole, actorMembership, targetMembership] =
      await Promise.all([
        RoleModel.findOne({ organizationId, key: "owner" }).session(session),
        RoleModel.findOne({ organizationId, key: "admin" }).session(session),
        OrganizationMemberModel.findOne({
          _id: access.membership._id,
          organizationId,
          userId: actor.id,
          status: "active",
        }).session(session),
        OrganizationMemberModel.findOne({
          _id: input.targetMemberId,
          organizationId,
          status: "active",
        }).session(session),
      ]);
    if (!ownerRole || !adminRole || !actorMembership || !targetMembership) {
      throw new AppError(
        409,
        "OWNERSHIP_CHANGED",
        "Membership changed. Refresh and try again.",
      );
    }
    const actorRole = await RoleModel.findOne({
      _id: actorMembership.roleId,
      organizationId,
    }).session(session);
    if (actorRole?.key !== "owner")
      throw new AppError(
        409,
        "OWNERSHIP_CHANGED",
        "Ownership changed. Refresh and try again.",
      );
    targetMembership.roleId = ownerRole._id;
    targetMembership.updatedBy = new mongoose.Types.ObjectId(actor.id);
    actorMembership.roleId = adminRole._id;
    actorMembership.updatedBy = new mongoose.Types.ObjectId(actor.id);
    await Promise.all([
      targetMembership.save({ session }),
      actorMembership.save({ session }),
    ]);
  });
  await writeAudit({
    organizationId,
    actorUserId: actor.id,
    action: "organization.ownership_transferred",
    targetType: "membership",
    targetId: input.targetMemberId,
    requestId: context.requestId,
    ipHash: context.ipHash,
  });
  return { ownerMemberId: input.targetMemberId };
}

export async function leaveOrganization(
  organizationId: string,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  await connectMongoose();
  const membershipId = await mongoose.connection.transaction(
    async (session) => {
      const membership = await OrganizationMemberModel.findOne({
        organizationId,
        userId: actor.id,
        status: "active",
      }).session(session);
      if (!membership)
        throw new AppError(
          404,
          "ORGANIZATION_NOT_FOUND",
          "The organization was not found.",
        );
      const role = await RoleModel.findOne({
        _id: membership.roleId,
        organizationId,
      }).session(session);
      if (
        role?.key === "owner" &&
        (await countActiveOwners(organizationId, session)) <= 1
      ) {
        throw new AppError(
          409,
          "LAST_OWNER",
          "Transfer ownership before leaving this organization.",
        );
      }
      membership.status = "removed";
      membership.removedAt = new Date();
      membership.updatedBy = new mongoose.Types.ObjectId(actor.id);
      await membership.save({ session });
      return membership._id.toString();
    },
  );
  await writeAudit({
    organizationId,
    actorUserId: actor.id,
    action: "organization.member_left",
    targetType: "membership",
    targetId: membershipId,
    requestId: context.requestId,
    ipHash: context.ipHash,
  });
  return { left: true };
}

export function hasPermission(
  permissions: readonly string[],
  permission: Permission,
): boolean {
  return permissions.includes(permission);
}
