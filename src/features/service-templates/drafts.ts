import { Types } from "mongoose";

import { findActiveEnvironment } from "@/features/environments/service";
import { PERMISSIONS } from "@/features/organizations/permissions";
import { findActiveProject } from "@/features/projects/service";
import {
  createServiceDraftSchema,
  updateServiceDraftSchema,
} from "@/features/service-templates/draft-schemas";
import { buildDesiredConfiguration } from "@/features/service-templates/wizard";
import { writeAudit } from "@/server/audit";
import {
  requireOrganizationPermission,
  type AuthorizedUser,
} from "@/server/authorization";
import {
  ServiceDraftModel,
  ServiceTemplateModel,
  type ServiceDraftRecord,
  type ServiceTemplateRecord,
} from "@/server/db/control-plane-models";
import { runTransaction } from "@/server/domain/transactions";
import { AppError } from "@/server/security/errors";
import type { RequestContext } from "@/server/security/request";

function serializeDraft(draft: ServiceDraftRecord) {
  const values =
    draft.values instanceof Map
      ? Object.fromEntries(draft.values)
      : draft.values;
  const environment =
    draft.desiredConfiguration.environment instanceof Map
      ? Object.fromEntries(draft.desiredConfiguration.environment)
      : draft.desiredConfiguration.environment;
  const parameters =
    draft.desiredConfiguration.parameters instanceof Map
      ? Object.fromEntries(draft.desiredConfiguration.parameters)
      : draft.desiredConfiguration.parameters;
  return {
    id: draft._id.toString(),
    organizationId: draft.organizationId.toString(),
    projectId: draft.projectId.toString(),
    environmentId: draft.environmentId.toString(),
    templateId: draft.templateId,
    manifestVersion: draft.manifestVersion,
    name: draft.name,
    values,
    desiredConfiguration: {
      ...draft.desiredConfiguration,
      environment,
      parameters,
    },
    status: draft.status,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    version: draft.__v,
  };
}

async function assertDraftAccess(
  organizationId: string,
  projectId: string,
  environmentId: string,
  userId: string,
): Promise<void> {
  await requireOrganizationPermission(
    userId,
    organizationId,
    PERMISSIONS.SERVICE_CREATE,
  );
  await findActiveProject(organizationId, projectId);
  await findActiveEnvironment(organizationId, projectId, environmentId);
}

async function loadDraftTemplate(
  templateId: string,
  manifestVersion: number,
): Promise<ServiceTemplateRecord> {
  const template = await ServiceTemplateModel.findOne({
    organizationId: null,
    templateId,
    manifestVersion,
    publicationState: { $in: ["published", "deprecated"] },
  }).lean<ServiceTemplateRecord>();
  if (!template) {
    throw new AppError(
      404,
      "TEMPLATE_NOT_FOUND",
      "The selected service template version was not found.",
    );
  }
  return template;
}

export async function listServiceDrafts(
  organizationId: string,
  projectId: string,
  environmentId: string,
  userId: string,
) {
  await assertDraftAccess(organizationId, projectId, environmentId, userId);
  const drafts = await ServiceDraftModel.find({
    organizationId,
    projectId,
    environmentId,
    userId,
    status: "active",
  })
    .sort({ updatedAt: -1, _id: -1 })
    .lean<ServiceDraftRecord[]>();
  return drafts.map(serializeDraft);
}

export async function getServiceDraft(
  organizationId: string,
  projectId: string,
  environmentId: string,
  draftId: string,
  userId: string,
) {
  await assertDraftAccess(organizationId, projectId, environmentId, userId);
  const draft = await ServiceDraftModel.findOne({
    _id: draftId,
    organizationId,
    projectId,
    environmentId,
    userId,
    status: "active",
  }).lean<ServiceDraftRecord>();
  if (!draft) {
    throw new AppError(
      404,
      "DRAFT_NOT_FOUND",
      "The service draft was not found.",
    );
  }
  return serializeDraft(draft);
}

export async function createServiceDraft(
  organizationId: string,
  projectId: string,
  environmentId: string,
  rawInput: unknown,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  const input = createServiceDraftSchema.parse(rawInput);
  await assertDraftAccess(organizationId, projectId, environmentId, actor.id);
  const template = await loadDraftTemplate(
    input.templateId,
    input.manifestVersion,
  );
  const normalized = buildDesiredConfiguration(template.manifest, input.values);
  const draft = await runTransaction(async (session) => {
    const created = (
      await ServiceDraftModel.create(
        [
          {
            organizationId,
            projectId,
            environmentId,
            userId: actor.id,
            templateId: input.templateId,
            manifestVersion: input.manifestVersion,
            name: input.name,
            values: normalized.values,
            desiredConfiguration: normalized.desiredConfiguration,
            status: "active",
            expiresAt: null,
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        ],
        { session },
      )
    )[0];
    await writeAudit(
      {
        organizationId,
        actorUserId: actor.id,
        action: "service_draft.created",
        targetType: "service_draft",
        targetId: created._id.toString(),
        requestId: context.requestId,
        ipHash: context.ipHash,
        metadata: { projectId, environmentId, templateId: input.templateId },
      },
      session,
    );
    return created.toObject() as ServiceDraftRecord;
  });
  return serializeDraft(draft);
}

export async function updateServiceDraft(
  organizationId: string,
  projectId: string,
  environmentId: string,
  draftId: string,
  rawInput: unknown,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  const input = updateServiceDraftSchema.parse(rawInput);
  await assertDraftAccess(organizationId, projectId, environmentId, actor.id);
  const current = await ServiceDraftModel.findOne({
    _id: draftId,
    organizationId,
    projectId,
    environmentId,
    userId: actor.id,
    status: "active",
  }).lean<ServiceDraftRecord>();
  if (!current) {
    throw new AppError(
      404,
      "DRAFT_NOT_FOUND",
      "The service draft was not found.",
    );
  }
  const set: Record<string, unknown> = { updatedBy: actor.id };
  if (input.name !== undefined) set.name = input.name;
  if (input.values !== undefined) {
    const template = await loadDraftTemplate(
      current.templateId,
      current.manifestVersion,
    );
    const normalized = buildDesiredConfiguration(
      template.manifest,
      input.values,
    );
    set.values = normalized.values;
    set.desiredConfiguration = normalized.desiredConfiguration;
  }
  const updated = await runTransaction(async (session) => {
    const draft = await ServiceDraftModel.findOneAndUpdate(
      {
        _id: draftId,
        organizationId,
        projectId,
        environmentId,
        userId: actor.id,
        status: "active",
        __v: input.version,
      },
      { $set: set, $inc: { __v: 1 } },
      { returnDocument: "after", session },
    ).lean<ServiceDraftRecord>();
    if (!draft) {
      throw new AppError(
        409,
        "VERSION_CONFLICT",
        "The service draft changed. Refresh and try again.",
      );
    }
    await writeAudit(
      {
        organizationId,
        actorUserId: actor.id,
        action: "service_draft.updated",
        targetType: "service_draft",
        targetId: draftId,
        requestId: context.requestId,
        ipHash: context.ipHash,
        metadata: { projectId, environmentId },
      },
      session,
    );
    return draft;
  });
  return serializeDraft(updated);
}

export async function abandonServiceDraft(
  organizationId: string,
  projectId: string,
  environmentId: string,
  draftId: string,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  await assertDraftAccess(organizationId, projectId, environmentId, actor.id);
  await runTransaction(async (session) => {
    const draft = await ServiceDraftModel.findOneAndUpdate(
      {
        _id: draftId,
        organizationId,
        projectId,
        environmentId,
        userId: actor.id,
        status: "active",
      },
      {
        $set: {
          status: "abandoned",
          updatedBy: new Types.ObjectId(actor.id),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
        },
        $inc: { __v: 1 },
      },
      { returnDocument: "after", session },
    ).lean<ServiceDraftRecord>();
    if (!draft) {
      throw new AppError(
        404,
        "DRAFT_NOT_FOUND",
        "The service draft was not found.",
      );
    }
    await writeAudit(
      {
        organizationId,
        actorUserId: actor.id,
        action: "service_draft.abandoned",
        targetType: "service_draft",
        targetId: draftId,
        requestId: context.requestId,
        ipHash: context.ipHash,
        metadata: { projectId, environmentId },
      },
      session,
    );
  });
  return { id: draftId, abandoned: true };
}
