import { Types, type ClientSession } from "mongoose";

import { PERMISSIONS } from "@/features/organizations/permissions";
import {
  createProjectSchema,
  projectSlugSchema,
  updateProjectSchema,
} from "@/features/projects/schemas";
import { writeAudit } from "@/server/audit";
import {
  requireOrganizationPermission,
  type AuthorizedUser,
} from "@/server/authorization";
import {
  EnvironmentModel,
  ProjectModel,
  type ProjectRecord,
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
      .slice(0, 80) || "project"
  );
}

function serializeProject(project: ProjectRecord) {
  return {
    id: project._id.toString(),
    organizationId: project.organizationId.toString(),
    name: project.name,
    slug: project.slug,
    description: project.description,
    icon: project.icon,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    version: project.__v,
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

function duplicateSlugError(): AppError {
  return new AppError(
    409,
    "PROJECT_SLUG_EXISTS",
    "A project with this slug already exists in the organization.",
  );
}

export async function findActiveProject(
  organizationId: string,
  projectId: string,
  session?: ClientSession,
): Promise<ProjectRecord> {
  const query = ProjectModel.findOne({
    _id: projectId,
    organizationId,
    status: "active",
  });
  if (session) query.session(session);
  const project = await query.lean<ProjectRecord>();
  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "The project was not found.");
  }
  return project;
}

export async function listProjects(organizationId: string, userId: string) {
  await requireOrganizationPermission(
    userId,
    organizationId,
    PERMISSIONS.PROJECT_VIEW,
  );
  const projects = await ProjectModel.find({ organizationId, status: "active" })
    .sort({ name: 1, _id: 1 })
    .lean<ProjectRecord[]>();
  return projects.map(serializeProject);
}

export async function getProject(
  organizationId: string,
  projectId: string,
  userId: string,
) {
  await requireOrganizationPermission(
    userId,
    organizationId,
    PERMISSIONS.PROJECT_VIEW,
  );
  return serializeProject(await findActiveProject(organizationId, projectId));
}

export async function createProject(
  organizationId: string,
  rawInput: unknown,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  const input = createProjectSchema.parse(rawInput);
  await requireOrganizationPermission(
    actor.id,
    organizationId,
    PERMISSIONS.PROJECT_CREATE,
  );
  const slug = projectSlugSchema.parse(input.slug ?? slugFromName(input.name));

  let project: ProjectRecord;
  try {
    project = await runTransaction(async (session) => {
      const created = (
        await ProjectModel.create(
          [
            {
              organizationId,
              name: input.name,
              slug,
              description: input.description ?? null,
              icon: input.icon,
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
          aggregateType: "project",
          aggregateId: created._id,
          eventType: "project.created",
          payload: { projectId: created._id.toString() },
          actorUserId: actor.id,
          requestId: context.requestId,
        },
        session,
      );
      await writeAudit(
        {
          organizationId,
          actorUserId: actor.id,
          action: "project.created",
          targetType: "project",
          targetId: created._id.toString(),
          requestId: context.requestId,
          ipHash: context.ipHash,
        },
        session,
      );
      return created.toObject() as ProjectRecord;
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw duplicateSlugError();
    throw error;
  }

  return serializeProject(project);
}

export async function updateProject(
  organizationId: string,
  projectId: string,
  rawInput: unknown,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  const input = updateProjectSchema.parse(rawInput);
  await requireOrganizationPermission(
    actor.id,
    organizationId,
    PERMISSIONS.PROJECT_CREATE,
  );

  let project: ProjectRecord;
  try {
    project = await runTransaction(async (session) => {
      const set: Record<string, unknown> = { updatedBy: actor.id };
      if (input.name !== undefined) set.name = input.name;
      if (input.slug !== undefined) set.slug = input.slug;
      if (input.description !== undefined) set.description = input.description;
      if (input.icon !== undefined) set.icon = input.icon;
      const updated = await ProjectModel.findOneAndUpdate(
        {
          _id: projectId,
          organizationId,
          status: "active",
          __v: input.version,
        },
        { $set: set, $inc: { __v: 1 } },
        { returnDocument: "after", session },
      ).lean<ProjectRecord>();
      if (!updated) {
        const exists = await ProjectModel.exists({
          _id: projectId,
          organizationId,
          status: "active",
        }).session(session);
        if (!exists) {
          throw new AppError(
            404,
            "PROJECT_NOT_FOUND",
            "The project was not found.",
          );
        }
        throw new AppError(
          409,
          "VERSION_CONFLICT",
          "The project changed. Refresh and try again.",
        );
      }
      await createOutboxEvent(
        {
          organizationId,
          aggregateType: "project",
          aggregateId: updated._id,
          eventType: "project.updated",
          payload: { projectId: updated._id.toString() },
          actorUserId: actor.id,
          requestId: context.requestId,
        },
        session,
      );
      await writeAudit(
        {
          organizationId,
          actorUserId: actor.id,
          action: "project.updated",
          targetType: "project",
          targetId: projectId,
          requestId: context.requestId,
          ipHash: context.ipHash,
        },
        session,
      );
      return updated;
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw duplicateSlugError();
    throw error;
  }

  return serializeProject(project);
}

export async function deleteProject(
  organizationId: string,
  projectId: string,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  await requireOrganizationPermission(
    actor.id,
    organizationId,
    PERMISSIONS.PROJECT_CREATE,
  );
  await runTransaction(async (session) => {
    const project = await ProjectModel.findOne({
      _id: projectId,
      organizationId,
      status: "active",
    }).session(session);
    if (!project) {
      throw new AppError(
        404,
        "PROJECT_NOT_FOUND",
        "The project was not found.",
      );
    }
    if (
      await EnvironmentModel.exists({
        organizationId,
        projectId,
        status: "active",
      }).session(session)
    ) {
      throw new AppError(
        409,
        "PROJECT_NOT_EMPTY",
        "Delete the project's active environments first.",
      );
    }
    project.status = "deleted";
    project.deletedAt = new Date();
    project.deletedBy = new Types.ObjectId(actor.id);
    project.updatedBy = new Types.ObjectId(actor.id);
    await project.save({ session });
    await createOutboxEvent(
      {
        organizationId,
        aggregateType: "project",
        aggregateId: project._id,
        eventType: "project.deleted",
        payload: { projectId: project._id.toString() },
        actorUserId: actor.id,
        requestId: context.requestId,
      },
      session,
    );
    await writeAudit(
      {
        organizationId,
        actorUserId: actor.id,
        action: "project.deleted",
        targetType: "project",
        targetId: projectId,
        requestId: context.requestId,
        ipHash: context.ipHash,
      },
      session,
    );
  });

  return { id: projectId, deleted: true };
}
