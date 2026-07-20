import { nanoid } from "nanoid";
import { Types, type ClientSession } from "mongoose";

import {
  createEnvironmentSchema,
  environmentSlugSchema,
  updateEnvironmentSchema,
} from "@/features/environments/schemas";
import { PERMISSIONS } from "@/features/organizations/permissions";
import { findActiveProject } from "@/features/projects/service";
import { hasSchedulableWorkerInRegion } from "@/features/resources/worker-selection";
import { writeAudit } from "@/server/audit";
import {
  requireOrganizationPermission,
  type AuthorizedUser,
} from "@/server/authorization";
import {
  EnvironmentModel,
  ProjectModel,
  ResourceReservationModel,
  type EnvironmentRecord,
} from "@/server/db/control-plane-models";
import { createOutboxEvent } from "@/server/domain/outbox";
import { runTransaction } from "@/server/domain/transactions";
import { AppError } from "@/server/security/errors";
import type { RequestContext } from "@/server/security/request";

function slugFromName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "environment"
  );
}

function serializeEnvironment(environment: EnvironmentRecord) {
  return {
    id: environment._id.toString(),
    organizationId: environment.organizationId.toString(),
    projectId: environment.projectId.toString(),
    name: environment.name,
    slug: environment.slug,
    type: environment.type,
    isDefault: environment.isDefault,
    region: environment.region,
    networkId: environment.networkId,
    status: environment.status,
    createdAt: environment.createdAt,
    updatedAt: environment.updatedAt,
    version: environment.__v,
  };
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 11000,
  );
}

function duplicateEnvironmentError(): AppError {
  return new AppError(
    409,
    "ENVIRONMENT_CONFLICT",
    "The environment slug or default selection conflicts with another environment.",
  );
}

async function assertRegionAvailable(
  region: string,
  session?: ClientSession,
): Promise<void> {
  if (!(await hasSchedulableWorkerInRegion(region, new Date(), session))) {
    throw new AppError(
      409,
      "REGION_UNAVAILABLE",
      "The selected region has no online schedulable workers.",
    );
  }
}

export async function findActiveEnvironment(
  organizationId: string,
  projectId: string,
  environmentId: string,
  session?: ClientSession,
): Promise<EnvironmentRecord> {
  const query = EnvironmentModel.findOne({
    _id: environmentId,
    organizationId,
    projectId,
    status: "active",
  });
  if (session) query.session(session);
  const environment = await query.lean<EnvironmentRecord>();
  if (!environment) {
    throw new AppError(
      404,
      "ENVIRONMENT_NOT_FOUND",
      "The environment was not found.",
    );
  }
  return environment;
}

export async function listEnvironments(
  organizationId: string,
  projectId: string,
  userId: string,
) {
  await requireOrganizationPermission(
    userId,
    organizationId,
    PERMISSIONS.PROJECT_VIEW,
  );
  await findActiveProject(organizationId, projectId);
  const environments = await EnvironmentModel.find({
    organizationId,
    projectId,
    status: "active",
  })
    .sort({ type: 1, name: 1, _id: 1 })
    .lean<EnvironmentRecord[]>();
  return environments.map(serializeEnvironment);
}

export async function getEnvironment(
  organizationId: string,
  projectId: string,
  environmentId: string,
  userId: string,
) {
  await requireOrganizationPermission(
    userId,
    organizationId,
    PERMISSIONS.PROJECT_VIEW,
  );
  await findActiveProject(organizationId, projectId);
  return serializeEnvironment(
    await findActiveEnvironment(organizationId, projectId, environmentId),
  );
}

export async function createEnvironment(
  organizationId: string,
  projectId: string,
  rawInput: unknown,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  const input = createEnvironmentSchema.parse(rawInput);
  await requireOrganizationPermission(
    actor.id,
    organizationId,
    PERMISSIONS.ENVIRONMENT_MANAGE,
  );
  await findActiveProject(organizationId, projectId);
  await assertRegionAvailable(input.region);
  const slug = environmentSlugSchema.parse(
    input.slug ?? slugFromName(input.name),
  );

  let environment: EnvironmentRecord;
  try {
    environment = await runTransaction(async (session) => {
      await findActiveProject(organizationId, projectId, session);
      const guardedProject = await ProjectModel.updateOne(
        { _id: projectId, organizationId, status: "active" },
        {
          $inc: { environmentRevision: 1 },
          $set: { updatedBy: actor.id },
        },
        { session },
      );
      if (guardedProject.matchedCount !== 1) {
        throw new AppError(
          404,
          "PROJECT_NOT_FOUND",
          "The project was not found.",
        );
      }
      await assertRegionAvailable(input.region, session);
      const created = (
        await EnvironmentModel.create(
          [
            {
              organizationId,
              projectId,
              name: input.name,
              slug,
              type: input.type,
              isDefault: input.isDefault,
              region: input.region,
              networkId: `net_${nanoid(24)}`,
              createdBy: actor.id,
              updatedBy: actor.id,
            },
          ],
          { session },
        )
      )[0];
      await createOutboxEvent(
        {
          organizationId,
          aggregateType: "environment",
          aggregateId: created._id,
          eventType: "environment.created",
          payload: {
            projectId,
            environmentId: created._id.toString(),
            region: created.region,
          },
          actorUserId: actor.id,
          requestId: context.requestId,
        },
        session,
      );
      await writeAudit(
        {
          organizationId,
          actorUserId: actor.id,
          action: "environment.created",
          targetType: "environment",
          targetId: created._id.toString(),
          requestId: context.requestId,
          ipHash: context.ipHash,
          metadata: { projectId, region: created.region },
        },
        session,
      );
      return created.toObject() as EnvironmentRecord;
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw duplicateEnvironmentError();
    throw error;
  }

  return serializeEnvironment(environment);
}

export async function updateEnvironment(
  organizationId: string,
  projectId: string,
  environmentId: string,
  rawInput: unknown,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  const input = updateEnvironmentSchema.parse(rawInput);
  await requireOrganizationPermission(
    actor.id,
    organizationId,
    PERMISSIONS.ENVIRONMENT_MANAGE,
  );
  await findActiveProject(organizationId, projectId);
  if (input.region) await assertRegionAvailable(input.region);

  let environment: EnvironmentRecord;
  try {
    environment = await runTransaction(async (session) => {
      await findActiveProject(organizationId, projectId, session);
      if (input.region) await assertRegionAvailable(input.region, session);
      const set: Record<string, unknown> = { updatedBy: actor.id };
      for (const key of [
        "name",
        "slug",
        "type",
        "isDefault",
        "region",
      ] as const) {
        if (input[key] !== undefined) set[key] = input[key];
      }
      const updated = await EnvironmentModel.findOneAndUpdate(
        {
          _id: environmentId,
          organizationId,
          projectId,
          status: "active",
          __v: input.version,
        },
        { $set: set, $inc: { __v: 1 } },
        { returnDocument: "after", session },
      ).lean<EnvironmentRecord>();
      if (!updated) {
        const exists = await EnvironmentModel.exists({
          _id: environmentId,
          organizationId,
          projectId,
          status: "active",
        }).session(session);
        if (!exists) {
          throw new AppError(
            404,
            "ENVIRONMENT_NOT_FOUND",
            "The environment was not found.",
          );
        }
        throw new AppError(
          409,
          "VERSION_CONFLICT",
          "The environment changed. Refresh and try again.",
        );
      }
      await createOutboxEvent(
        {
          organizationId,
          aggregateType: "environment",
          aggregateId: updated._id,
          eventType: "environment.updated",
          payload: {
            projectId,
            environmentId: updated._id.toString(),
            region: updated.region,
          },
          actorUserId: actor.id,
          requestId: context.requestId,
        },
        session,
      );
      await writeAudit(
        {
          organizationId,
          actorUserId: actor.id,
          action: "environment.updated",
          targetType: "environment",
          targetId: environmentId,
          requestId: context.requestId,
          ipHash: context.ipHash,
          metadata: { projectId, region: updated.region },
        },
        session,
      );
      return updated;
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw duplicateEnvironmentError();
    throw error;
  }

  return serializeEnvironment(environment);
}

export async function deleteEnvironment(
  organizationId: string,
  projectId: string,
  environmentId: string,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  await requireOrganizationPermission(
    actor.id,
    organizationId,
    PERMISSIONS.ENVIRONMENT_MANAGE,
  );
  await runTransaction(async (session) => {
    await findActiveProject(organizationId, projectId, session);
    const environment = await EnvironmentModel.findOne({
      _id: environmentId,
      organizationId,
      projectId,
      status: "active",
    }).session(session);
    if (!environment) {
      throw new AppError(
        404,
        "ENVIRONMENT_NOT_FOUND",
        "The environment was not found.",
      );
    }
    if (
      await ResourceReservationModel.exists({
        organizationId,
        projectId,
        environmentId,
        status: { $in: ["reserved", "confirmed"] },
      }).session(session)
    ) {
      throw new AppError(
        409,
        "ENVIRONMENT_NOT_EMPTY",
        "Release the environment's active resources before deleting it.",
      );
    }
    environment.status = "deleted";
    environment.deletedAt = new Date();
    environment.deletedBy = new Types.ObjectId(actor.id);
    environment.updatedBy = new Types.ObjectId(actor.id);
    await environment.save({ session });
    await createOutboxEvent(
      {
        organizationId,
        aggregateType: "environment",
        aggregateId: environment._id,
        eventType: "environment.deleted",
        payload: { projectId, environmentId },
        actorUserId: actor.id,
        requestId: context.requestId,
      },
      session,
    );
    await writeAudit(
      {
        organizationId,
        actorUserId: actor.id,
        action: "environment.deleted",
        targetType: "environment",
        targetId: environmentId,
        requestId: context.requestId,
        ipHash: context.ipHash,
        metadata: { projectId },
      },
      session,
    );
  });

  return { id: environmentId, deleted: true };
}
