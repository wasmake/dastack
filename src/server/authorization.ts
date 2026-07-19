import { auth } from "@/auth";
import type { Permission } from "@/features/organizations/permissions";
import { roleHasPermission } from "@/features/organizations/permissions";
import { validateAppSession } from "@/features/auth/sessions";
import { OrganizationMemberModel, RoleModel } from "@/server/db/models";
import { connectMongoose } from "@/server/db/mongodb";
import { AppError } from "@/server/security/errors";

export type AuthorizedUser = {
  id: string;
  email: string;
  sessionId: string;
  tokenVersion: number;
};

export async function requireAuthenticatedUser(): Promise<AuthorizedUser> {
  const session = await auth();
  if (
    !session?.user?.id ||
    !session.user.email ||
    !session.sessionId ||
    typeof session.tokenVersion !== "number"
  ) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  }
  const user = session.user;
  const email = user.email as string;
  const active = await validateAppSession({
    userId: user.id,
    sessionId: session.sessionId,
    tokenVersion: session.tokenVersion,
  });
  if (!active)
    throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return {
    id: user.id,
    email,
    sessionId: session.sessionId,
    tokenVersion: session.tokenVersion,
  };
}

export async function requireOrganizationPermission(
  userId: string,
  organizationId: string,
  permission: Permission,
) {
  await connectMongoose();
  const membership = await OrganizationMemberModel.findOne({
    organizationId,
    userId,
    status: "active",
  }).lean();
  if (!membership)
    throw new AppError(
      404,
      "ORGANIZATION_NOT_FOUND",
      "The organization was not found.",
    );
  const role = await RoleModel.findOne({
    _id: membership.roleId,
    organizationId,
  }).lean();
  if (!role || !roleHasPermission(role.permissions, permission)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "You do not have permission to perform this action.",
    );
  }
  return { membership, role };
}
