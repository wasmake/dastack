import { createHash } from "node:crypto";

import { Types } from "mongoose";

import { serviceTemplateManifestSchema } from "@/features/service-templates/schemas";
import { writeAudit } from "@/server/audit";
import {
  ServiceTemplateModel,
  type ServiceTemplateRecord,
} from "@/server/db/control-plane-models";
import { connectMongoose } from "@/server/db/mongodb";
import type { ServiceTemplateManifest } from "@/server/domain/service-template";
import { runTransaction } from "@/server/domain/transactions";
import { AppError } from "@/server/security/errors";

export type TechnicalAdminPrincipal = {
  kind: "technical-admin";
  actorUserId: string;
  source: string;
  requestId: string;
  ipHash?: string | null;
};

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function manifestHash(manifest: ServiceTemplateManifest): string {
  return createHash("sha256").update(canonicalize(manifest)).digest("hex");
}

function serializeTemplate(template: ServiceTemplateRecord) {
  return {
    id: template.templateId,
    manifestVersion: template.manifestVersion,
    publicationState: template.publicationState,
    publishedAt: template.publishedAt,
    manifest: template.manifest,
  };
}

export async function listPublishedTemplates() {
  await connectMongoose();
  const templates = await ServiceTemplateModel.find({
    organizationId: null,
    publicationState: "published",
  })
    .sort({ templateId: 1, manifestVersion: -1 })
    .lean<ServiceTemplateRecord[]>();
  const latest = new Map<string, ServiceTemplateRecord>();
  for (const template of templates) {
    if (!latest.has(template.templateId))
      latest.set(template.templateId, template);
  }
  return [...latest.values()].map(serializeTemplate);
}

export async function getPublishedTemplate(
  templateId: string,
  manifestVersion?: number,
) {
  await connectMongoose();
  const template = await ServiceTemplateModel.findOne({
    organizationId: null,
    templateId,
    publicationState: "published",
    ...(manifestVersion === undefined ? {} : { manifestVersion }),
  })
    .sort({ manifestVersion: -1 })
    .lean<ServiceTemplateRecord>();
  if (!template) {
    throw new AppError(
      404,
      "TEMPLATE_NOT_FOUND",
      "The published service template was not found.",
    );
  }
  return serializeTemplate(template);
}

export async function upsertServiceTemplateManifest(
  rawManifest: unknown,
  publicationState: "draft" | "published" | "deprecated",
  principal: TechnicalAdminPrincipal,
) {
  if (
    principal.kind !== "technical-admin" ||
    !Types.ObjectId.isValid(principal.actorUserId) ||
    principal.source.trim().length < 1
  ) {
    throw new AppError(
      403,
      "TECHNICAL_ADMIN_REQUIRED",
      "Technical administrator authorization is required.",
    );
  }
  const manifest = serviceTemplateManifestSchema.parse(
    rawManifest,
  ) as ServiceTemplateManifest;
  const hash = manifestHash(manifest);
  const now = new Date();

  const template = await runTransaction(async (session) => {
    const existing = await ServiceTemplateModel.findOne({
      templateId: manifest.id,
      manifestVersion: manifest.manifestVersion,
    }).session(session);
    if (existing) {
      if (existing.manifestHash !== hash) {
        throw new AppError(
          409,
          "IMMUTABLE_TEMPLATE_VERSION",
          "This template version already exists with different content.",
        );
      }
      if (
        existing.publicationState === "published" &&
        publicationState === "draft"
      ) {
        throw new AppError(
          409,
          "INVALID_PUBLICATION_TRANSITION",
          "A published template version cannot return to draft.",
        );
      }
      existing.publicationState = publicationState;
      existing.updatedBy = new Types.ObjectId(principal.actorUserId);
      if (publicationState === "published" && !existing.publishedAt) {
        existing.publishedAt = now;
      }
      if (publicationState === "deprecated" && !existing.deprecatedAt) {
        existing.deprecatedAt = now;
      }
      await existing.save({ session });
      await writeAudit(
        {
          actorUserId: principal.actorUserId,
          action: "service_template.imported",
          targetType: "service_template",
          targetId: `${manifest.id}:${manifest.manifestVersion}`,
          requestId: principal.requestId,
          ipHash: principal.ipHash,
          metadata: { publicationState, source: principal.source },
        },
        session,
      );
      return existing.toObject() as ServiceTemplateRecord;
    }

    const created = (
      await ServiceTemplateModel.create(
        [
          {
            organizationId: null,
            templateId: manifest.id,
            manifestVersion: manifest.manifestVersion,
            manifest,
            manifestHash: hash,
            publicationState,
            publishedAt: publicationState === "published" ? now : null,
            deprecatedAt: publicationState === "deprecated" ? now : null,
            createdBy: principal.actorUserId,
            updatedBy: principal.actorUserId,
          },
        ],
        { session },
      )
    )[0];
    await writeAudit(
      {
        actorUserId: principal.actorUserId,
        action: "service_template.imported",
        targetType: "service_template",
        targetId: `${manifest.id}:${manifest.manifestVersion}`,
        requestId: principal.requestId,
        ipHash: principal.ipHash,
        metadata: { publicationState, source: principal.source },
      },
      session,
    );
    return created.toObject() as ServiceTemplateRecord;
  });

  return serializeTemplate(template);
}

export { serviceTemplateManifestSchema } from "@/features/service-templates/schemas";
export type {
  NormalizedDesiredConfiguration,
  ServiceTemplateManifest,
  WizardValues,
} from "@/server/domain/service-template";
