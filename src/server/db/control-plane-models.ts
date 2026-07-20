import { model, models, Schema, Types, type Model } from "mongoose";

import type {
  NormalizedDesiredConfiguration,
  ServiceTemplateManifest,
  WizardValues,
} from "@/server/domain/service-template";
import type {
  ReservableResources,
  ResourceQuotaCounters,
  ResourceQuotaLimits,
  WorkerResourceCapacity,
} from "@/server/domain/resources";

type Timestamps = {
  createdAt: Date;
  updatedAt: Date;
  __v: number;
};

type TenantAudit = {
  organizationId: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
};

export type ProjectRecord = Timestamps &
  TenantAudit & {
    _id: Types.ObjectId;
    name: string;
    slug: string;
    icon: "box" | "boxes" | "database" | "globe" | "layers";
    environmentRevision: number;
    description: string | null;
    status: "active" | "deleted";
    deletedAt: Date | null;
    deletedBy: Types.ObjectId | null;
  };

export type EnvironmentRecord = Timestamps &
  TenantAudit & {
    _id: Types.ObjectId;
    projectId: Types.ObjectId;
    name: string;
    slug: string;
    type: "production" | "preview" | "development" | "custom";
    isDefault: boolean;
    region: string;
    networkId: string;
    reservationRevision: number;
    status: "active" | "deleted";
    deletedAt: Date | null;
    deletedBy: Types.ObjectId | null;
  };

export type ServiceTemplateRecord = Timestamps & {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId | null;
  templateId: string;
  manifestVersion: number;
  manifest: ServiceTemplateManifest;
  manifestHash: string;
  publicationState: "draft" | "published" | "deprecated";
  publishedAt: Date | null;
  deprecatedAt: Date | null;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
};

export type ServiceDraftRecord = Timestamps &
  TenantAudit & {
    _id: Types.ObjectId;
    projectId: Types.ObjectId;
    environmentId: Types.ObjectId;
    userId: Types.ObjectId;
    templateId: string;
    manifestVersion: number;
    name: string;
    values: WizardValues;
    desiredConfiguration: NormalizedDesiredConfiguration;
    status: "active" | "submitted" | "abandoned";
    expiresAt: Date | null;
  };

export type WorkerNodeRecord = Timestamps & {
  _id: Types.ObjectId;
  providerNodeId: string;
  name: string;
  region: string;
  status: "online" | "offline" | "draining" | "disabled";
  schedulable: boolean;
  capacity: WorkerResourceCapacity;
  reserved: WorkerResourceCapacity;
  allocated: WorkerResourceCapacity;
  reportedAllocated: WorkerResourceCapacity;
  provider: { name: string; capabilities: string[] };
  runtime: {
    phase: string;
    platform: string;
    architecture: string;
    nodeVersion: string;
    hostname: string;
    managedRuntime: string;
    uptimeSeconds: number;
  };
  hostUsage: {
    loadAverage1m: number;
    memoryUsedBytes: number;
    diskUsedBytes: number;
  };
  labels: Record<string, string>;
  lastHeartbeatAt: Date;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  disabledAt: Date | null;
  disabledBy: Types.ObjectId | null;
};

export type WorkerCredentialRecord = Timestamps & {
  _id: Types.ObjectId;
  workerId: Types.ObjectId;
  keyId: string;
  publicKey: string;
  status: "active" | "rotating" | "revoked" | "expired";
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revokedBy: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
};

export type ResourceEntitlementRecord = Timestamps &
  TenantAudit & {
    _id: Types.ObjectId;
    status: "active" | "suspended" | "canceled";
    billingStatus:
      "trialing" | "active" | "past_due" | "suspended" | "canceled";
    validFrom: Date;
    validUntil: Date | null;
    limits: ResourceQuotaLimits;
    reserved: ResourceQuotaCounters;
    allocated: ResourceQuotaCounters;
    suspendedAt: Date | null;
    canceledAt: Date | null;
  };

export type ResourceReservationRecord = Timestamps &
  TenantAudit & {
    _id: Types.ObjectId;
    projectId: Types.ObjectId;
    environmentId: Types.ObjectId;
    workerId: Types.ObjectId;
    workerNodeId: string;
    idempotencyKey: string;
    requestHash: string;
    resources: ReservableResources;
    serviceCount: number;
    status: "reserved" | "confirmed" | "released";
    expiresAt: Date;
    confirmedAt: Date | null;
    releasedAt: Date | null;
    releaseReason: "requested" | "stale" | "failed" | null;
  };

export type ResourceUsageRecord = Timestamps &
  TenantAudit & {
    _id: Types.ObjectId;
    projectId: Types.ObjectId;
    environmentId: Types.ObjectId;
    workerId: Types.ObjectId | null;
    reservationId: Types.ObjectId | null;
    periodStart: Date;
    periodEnd: Date;
    quantities: ReservableResources;
    source: string;
  };

export type UsageLedgerRecord = Timestamps &
  TenantAudit & {
    _id: Types.ObjectId;
    projectId: Types.ObjectId | null;
    environmentId: Types.ObjectId | null;
    reservationId: Types.ObjectId | null;
    idempotencyKey: string;
    entryType: "accrual" | "adjustment" | "credit";
    quantities: ReservableResources;
    occurredAt: Date;
    metadata: Record<string, unknown>;
  };

export type IdempotencyRecordDocument = Timestamps &
  TenantAudit & {
    _id: Types.ObjectId;
    scope: string;
    key: string;
    requestHash: string;
    resourceType: string;
    resourceId: string | null;
    status: "started" | "completed" | "failed";
    result: Record<string, unknown> | null;
    expiresAt: Date;
  };

export type OutboxEventRecord = Timestamps & {
  _id: Types.ObjectId;
  eventId: string;
  organizationId: Types.ObjectId;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  actorUserId: Types.ObjectId;
  requestId: string;
  deduplicationKey: string | null;
  status: "pending" | "processing" | "published" | "failed";
  attempts: number;
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  publishedAt: Date | null;
  lastErrorCode: string | null;
  expiresAt: Date | null;
};

const objectId = Schema.Types.ObjectId;
const strictOptions = {
  timestamps: true,
  optimisticConcurrency: true,
  strict: "throw" as const,
};

const auditFields = {
  createdBy: { type: objectId, required: true, ref: "User", immutable: true },
  updatedBy: { type: objectId, required: true, ref: "User" },
};

const tenantAuditFields = {
  organizationId: {
    type: objectId,
    required: true,
    ref: "Organization",
    immutable: true,
  },
  ...auditFields,
};

const projectSchema = new Schema(
  {
    ...tenantAuditFields,
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 80,
    },
    description: { type: String, default: null, trim: true, maxlength: 500 },
    icon: {
      type: String,
      enum: ["box", "boxes", "database", "globe", "layers"],
      default: "box",
      required: true,
    },
    environmentRevision: { type: Number, default: 0, required: true, min: 0 },
    status: {
      type: String,
      enum: ["active", "deleted"],
      default: "active",
      required: true,
    },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: objectId, ref: "User", default: null },
  },
  { ...strictOptions, collection: "projects" },
);
projectSchema.index(
  { organizationId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);
projectSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

const environmentSchema = new Schema(
  {
    ...tenantAuditFields,
    projectId: {
      type: objectId,
      required: true,
      ref: "Project",
      immutable: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 80,
    },
    type: {
      type: String,
      enum: ["production", "preview", "development", "custom"],
      required: true,
    },
    isDefault: { type: Boolean, default: false, required: true },
    region: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 80,
    },
    networkId: { type: String, required: true, immutable: true, maxlength: 80 },
    reservationRevision: { type: Number, default: 0, required: true, min: 0 },
    status: {
      type: String,
      enum: ["active", "deleted"],
      default: "active",
      required: true,
    },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: objectId, ref: "User", default: null },
  },
  { ...strictOptions, collection: "environments" },
);
environmentSchema.index(
  { projectId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);
environmentSchema.index({ networkId: 1 }, { unique: true });
environmentSchema.index(
  { projectId: 1, type: 1, isDefault: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active", isDefault: true },
  },
);
environmentSchema.index({ organizationId: 1, projectId: 1, status: 1 });

const imageSchema = new Schema(
  {
    repository: { type: String, required: true, trim: true, maxlength: 255 },
    tag: { type: String, required: true, trim: true, maxlength: 128 },
    digest: { type: String, maxlength: 128 },
  },
  { _id: false, versionKey: false, strict: "throw" },
);
const portSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 64 },
    port: { type: Number, required: true, min: 1, max: 65535 },
    protocol: { type: String, enum: ["tcp", "udp"], required: true },
    public: { type: Boolean, required: true },
  },
  { _id: false, versionKey: false, strict: "throw" },
);
const variableSchema = new Schema(
  {
    key: { type: String, required: true, maxlength: 128 },
    label: { type: String, required: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },
    type: {
      type: String,
      enum: ["string", "number", "boolean", "secret"],
      required: true,
    },
    required: { type: Boolean, required: true },
    default: { type: Schema.Types.Mixed },
  },
  { _id: false, versionKey: false, strict: "throw" },
);
const volumeSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 64 },
    mountPath: { type: String, required: true, maxlength: 512 },
    minimumSizeGiB: { type: Number, required: true, min: 0 },
    defaultSizeGiB: { type: Number, required: true, min: 0 },
  },
  { _id: false, versionKey: false, strict: "throw" },
);
const healthSchema = new Schema(
  {
    type: { type: String, enum: ["http", "tcp", "command"], required: true },
    portName: { type: String, maxlength: 64 },
    path: { type: String, maxlength: 512 },
    command: {
      type: [{ type: String, maxlength: 512 }],
      default: undefined,
    },
    intervalSeconds: { type: Number, required: true, min: 1, max: 3600 },
    timeoutSeconds: { type: Number, required: true, min: 1, max: 300 },
    failureThreshold: { type: Number, required: true, min: 1, max: 100 },
  },
  { _id: false, versionKey: false, strict: "throw" },
);
const resourceProfileSchema = new Schema(
  {
    id: { type: String, required: true, maxlength: 64 },
    label: { type: String, required: true, maxlength: 100 },
    cpuMillicores: { type: Number, required: true, min: 1 },
    memoryMiB: { type: Number, required: true, min: 1 },
  },
  { _id: false, versionKey: false, strict: "throw" },
);
const backupCapabilitiesSchema = new Schema(
  {
    supported: { type: Boolean, required: true },
    consistency: {
      type: String,
      enum: ["filesystem", "application"],
      required: true,
    },
    paths: [{ type: String, maxlength: 512 }],
  },
  { _id: false, versionKey: false, strict: "throw" },
);
const wizardFieldSchema = new Schema(
  {
    id: { type: String, required: true, maxlength: 128 },
    label: { type: String, required: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },
    type: {
      type: String,
      enum: ["text", "number", "boolean", "select", "secret"],
      required: true,
    },
    required: { type: Boolean, required: true },
    default: { type: Schema.Types.Mixed },
    options: {
      type: [
        new Schema(
          {
            label: { type: String, required: true, maxlength: 100 },
            value: { type: Schema.Types.Mixed, required: true },
          },
          { _id: false, versionKey: false, strict: "throw" },
        ),
      ],
      default: undefined,
    },
  },
  { _id: false, versionKey: false, strict: "throw" },
);
const wizardStepSchema = new Schema(
  {
    id: { type: String, required: true, maxlength: 64 },
    title: { type: String, required: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },
    fields: { type: [wizardFieldSchema], required: true },
  },
  { _id: false, versionKey: false, strict: "throw" },
);
const fieldMappingSchema = new Schema(
  {
    fieldId: { type: String, required: true, maxlength: 128 },
    path: { type: String, required: true, maxlength: 255 },
  },
  { _id: false, versionKey: false, strict: "throw" },
);
const generatedConfigSchema = new Schema(
  {
    path: { type: String, required: true, maxlength: 512 },
    template: { type: String, required: true, maxlength: 64 * 1024 },
    mode: { type: Number, min: 0, max: 0o777 },
  },
  { _id: false, versionKey: false, strict: "throw" },
);
const manifestSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 100,
    },
    manifestVersion: { type: Number, required: true, min: 1 },
    displayName: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 2_000 },
    category: { type: String, required: true, trim: true, maxlength: 80 },
    image: { type: imageSchema, required: true },
    ports: { type: [portSchema], required: true },
    variables: { type: [variableSchema], required: true },
    volumes: { type: [volumeSchema], required: true },
    health: { type: healthSchema },
    resourceProfiles: { type: [resourceProfileSchema], required: true },
    backups: { type: backupCapabilitiesSchema, required: true },
    configurationSchema: { type: Schema.Types.Mixed, required: true },
    wizard: {
      type: new Schema(
        {
          steps: { type: [wizardStepSchema], required: true },
          fieldMappings: { type: [fieldMappingSchema], required: true },
        },
        { _id: false, versionKey: false, strict: "throw" },
      ),
      required: true,
    },
    generatedConfigs: { type: [generatedConfigSchema], required: true },
  },
  { _id: false, versionKey: false, strict: "throw" },
);

const serviceTemplateSchema = new Schema(
  {
    organizationId: {
      type: objectId,
      ref: "Organization",
      default: null,
      immutable: true,
    },
    templateId: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 100,
    },
    manifestVersion: { type: Number, required: true, immutable: true, min: 1 },
    manifest: { type: manifestSchema, required: true, immutable: true },
    manifestHash: {
      type: String,
      required: true,
      immutable: true,
      match: /^[a-f\d]{64}$/,
    },
    publicationState: {
      type: String,
      enum: ["draft", "published", "deprecated"],
      default: "draft",
      required: true,
    },
    publishedAt: { type: Date, default: null },
    deprecatedAt: { type: Date, default: null },
    ...auditFields,
  },
  { ...strictOptions, collection: "service_templates" },
);
serviceTemplateSchema.index(
  { templateId: 1, manifestVersion: 1 },
  { unique: true },
);
serviceTemplateSchema.index({
  publicationState: 1,
  templateId: 1,
  manifestVersion: -1,
});

const desiredConfigurationSchema = new Schema(
  {
    template: {
      type: new Schema(
        {
          id: { type: String, required: true },
          manifestVersion: { type: Number, required: true },
        },
        { _id: false, versionKey: false, strict: "throw" },
      ),
      required: true,
    },
    image: { type: imageSchema, required: true },
    resources: {
      type: new Schema(
        {
          profileId: { type: String, required: true },
          cpuMillicores: { type: Number, required: true, min: 1 },
          memoryMiB: { type: Number, required: true, min: 1 },
        },
        { _id: false, versionKey: false, strict: "throw" },
      ),
      required: true,
    },
    network: { type: Schema.Types.Mixed, required: true },
    environment: { type: Map, of: Schema.Types.Mixed, required: true },
    storage: { type: Schema.Types.Mixed, required: true },
    health: { type: Schema.Types.Mixed, required: true },
    backups: { type: Schema.Types.Mixed, required: true },
    parameters: { type: Map, of: Schema.Types.Mixed, required: true },
    generatedConfigs: { type: [generatedConfigSchema], required: true },
  },
  { _id: false, versionKey: false, strict: "throw" },
);

const serviceDraftSchema = new Schema(
  {
    ...tenantAuditFields,
    projectId: {
      type: objectId,
      ref: "Project",
      required: true,
      immutable: true,
    },
    environmentId: {
      type: objectId,
      ref: "Environment",
      required: true,
      immutable: true,
    },
    userId: { type: objectId, ref: "User", required: true, immutable: true },
    templateId: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 100,
    },
    manifestVersion: { type: Number, required: true, immutable: true, min: 1 },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    values: { type: Map, of: Schema.Types.Mixed, required: true },
    desiredConfiguration: { type: desiredConfigurationSchema, required: true },
    status: {
      type: String,
      enum: ["active", "submitted", "abandoned"],
      default: "active",
      required: true,
    },
    expiresAt: { type: Date, default: null },
  },
  { ...strictOptions, collection: "service_drafts" },
);
serviceDraftSchema.index({
  organizationId: 1,
  projectId: 1,
  environmentId: 1,
  userId: 1,
  status: 1,
});
serviceDraftSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const workerCapacitySchema = new Schema(
  {
    cpuMillicores: { type: Number, required: true, min: 0 },
    memoryMiB: { type: Number, required: true, min: 0 },
    storageGiB: { type: Number, required: true, min: 0 },
    concurrentOperations: { type: Number, required: true, min: 0 },
  },
  { _id: false, versionKey: false, strict: "throw" },
);
const zeroWorkerCapacity = () => ({
  cpuMillicores: 0,
  memoryMiB: 0,
  storageGiB: 0,
  concurrentOperations: 0,
});
const workerNodeSchema = new Schema(
  {
    providerNodeId: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
      maxlength: 128,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    region: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 80,
    },
    status: {
      type: String,
      enum: ["online", "offline", "draining", "disabled"],
      default: "offline",
      required: true,
    },
    schedulable: { type: Boolean, default: false, required: true },
    capacity: { type: workerCapacitySchema, required: true },
    reserved: {
      type: workerCapacitySchema,
      required: true,
      default: zeroWorkerCapacity,
    },
    allocated: {
      type: workerCapacitySchema,
      required: true,
      default: zeroWorkerCapacity,
    },
    reportedAllocated: {
      type: workerCapacitySchema,
      required: true,
      default: zeroWorkerCapacity,
    },
    provider: {
      type: new Schema(
        {
          name: { type: String, required: true, maxlength: 64 },
          capabilities: {
            type: [{ type: String, maxlength: 64 }],
            required: true,
          },
        },
        { _id: false, versionKey: false, strict: "throw" },
      ),
      required: true,
    },
    runtime: {
      type: new Schema(
        {
          phase: { type: String, required: true, maxlength: 64 },
          platform: { type: String, required: true, maxlength: 32 },
          architecture: { type: String, required: true, maxlength: 32 },
          nodeVersion: { type: String, required: true, maxlength: 32 },
          hostname: { type: String, required: true, maxlength: 255 },
          managedRuntime: { type: String, required: true, maxlength: 64 },
          uptimeSeconds: { type: Number, required: true, min: 0 },
        },
        { _id: false, versionKey: false, strict: "throw" },
      ),
      required: true,
    },
    hostUsage: {
      type: new Schema(
        {
          loadAverage1m: { type: Number, required: true, min: 0 },
          memoryUsedBytes: { type: Number, required: true, min: 0 },
          diskUsedBytes: { type: Number, required: true, min: 0 },
        },
        { _id: false, versionKey: false, strict: "throw" },
      ),
      required: true,
    },
    labels: { type: Map, of: String, default: {} },
    lastHeartbeatAt: { type: Date, required: true },
    ...auditFields,
    disabledAt: { type: Date, default: null },
    disabledBy: { type: objectId, ref: "User", default: null },
  },
  { ...strictOptions, collection: "worker_nodes" },
);
workerNodeSchema.index({ providerNodeId: 1 }, { unique: true });
workerNodeSchema.index({
  region: 1,
  status: 1,
  schedulable: 1,
  lastHeartbeatAt: -1,
});

const workerCredentialSchema = new Schema(
  {
    workerId: {
      type: objectId,
      required: true,
      ref: "WorkerNode",
      immutable: true,
    },
    keyId: { type: String, required: true, immutable: true, maxlength: 128 },
    publicKey: {
      type: String,
      required: true,
      select: false,
      maxlength: 128,
    },
    status: {
      type: String,
      enum: ["active", "rotating", "revoked", "expired"],
      default: "active",
      required: true,
    },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: objectId, ref: "User", default: null },
    ...auditFields,
  },
  { ...strictOptions, collection: "worker_credentials" },
);
workerCredentialSchema.index({ keyId: 1 }, { unique: true });
workerCredentialSchema.index(
  { workerId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);
workerCredentialSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const reservableSchema = new Schema(
  {
    cpuMillicores: { type: Number, required: true, min: 0 },
    memoryMiB: { type: Number, required: true, min: 0 },
    storageGiB: { type: Number, required: true, min: 0 },
    transferGiB: { type: Number, required: true, min: 0 },
    backups: { type: Number, required: true, min: 0 },
    concurrentOperations: { type: Number, required: true, min: 0 },
  },
  { _id: false, versionKey: false, strict: "throw" },
);
const quotaSchema = new Schema(
  {
    cpuMillicores: { type: Number, required: true, min: 0 },
    memoryMiB: { type: Number, required: true, min: 0 },
    storageGiB: { type: Number, required: true, min: 0 },
    transferGiB: { type: Number, required: true, min: 0 },
    backups: { type: Number, required: true, min: 0 },
    concurrentOperations: { type: Number, required: true, min: 0 },
    projects: { type: Number, required: true, min: 0 },
    environments: { type: Number, required: true, min: 0 },
    services: { type: Number, required: true, min: 0 },
  },
  { _id: false, versionKey: false, strict: "throw" },
);
const zeroQuota = () => ({
  cpuMillicores: 0,
  memoryMiB: 0,
  storageGiB: 0,
  transferGiB: 0,
  backups: 0,
  concurrentOperations: 0,
  projects: 0,
  environments: 0,
  services: 0,
});
const resourceEntitlementSchema = new Schema(
  {
    ...tenantAuditFields,
    status: {
      type: String,
      enum: ["active", "suspended", "canceled"],
      default: "active",
      required: true,
    },
    billingStatus: {
      type: String,
      enum: ["trialing", "active", "past_due", "suspended", "canceled"],
      required: true,
    },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, default: null },
    limits: { type: quotaSchema, required: true },
    reserved: { type: quotaSchema, required: true, default: zeroQuota },
    allocated: { type: quotaSchema, required: true, default: zeroQuota },
    suspendedAt: { type: Date, default: null },
    canceledAt: { type: Date, default: null },
  },
  { ...strictOptions, collection: "resource_entitlements" },
);
resourceEntitlementSchema.index({ organizationId: 1 }, { unique: true });
resourceEntitlementSchema.index({ status: 1, billingStatus: 1, validUntil: 1 });

const resourceReservationSchema = new Schema(
  {
    ...tenantAuditFields,
    projectId: {
      type: objectId,
      ref: "Project",
      required: true,
      immutable: true,
    },
    environmentId: {
      type: objectId,
      ref: "Environment",
      required: true,
      immutable: true,
    },
    workerId: {
      type: objectId,
      ref: "WorkerNode",
      required: true,
      immutable: true,
    },
    workerNodeId: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 128,
    },
    idempotencyKey: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 160,
    },
    requestHash: {
      type: String,
      required: true,
      immutable: true,
      match: /^[a-f\d]{64}$/,
    },
    resources: { type: reservableSchema, required: true, immutable: true },
    serviceCount: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["reserved", "confirmed", "released"],
      default: "reserved",
      required: true,
    },
    expiresAt: { type: Date, required: true },
    confirmedAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
    releaseReason: {
      type: String,
      enum: ["requested", "stale", "failed", null],
      default: null,
    },
  },
  { ...strictOptions, collection: "resource_reservations" },
);
resourceReservationSchema.index(
  { organizationId: 1, idempotencyKey: 1 },
  { unique: true },
);
resourceReservationSchema.index({ organizationId: 1, status: 1, expiresAt: 1 });
resourceReservationSchema.index({ workerId: 1, status: 1 });
resourceReservationSchema.index({ projectId: 1, environmentId: 1, status: 1 });

const resourceUsageSchema = new Schema(
  {
    ...tenantAuditFields,
    projectId: {
      type: objectId,
      ref: "Project",
      required: true,
      immutable: true,
    },
    environmentId: {
      type: objectId,
      ref: "Environment",
      required: true,
      immutable: true,
    },
    workerId: {
      type: objectId,
      ref: "WorkerNode",
      default: null,
      immutable: true,
    },
    reservationId: {
      type: objectId,
      ref: "ResourceReservation",
      default: null,
      immutable: true,
    },
    periodStart: { type: Date, required: true, immutable: true },
    periodEnd: { type: Date, required: true, immutable: true },
    quantities: { type: reservableSchema, required: true, immutable: true },
    source: { type: String, required: true, immutable: true, maxlength: 80 },
  },
  { ...strictOptions, collection: "resource_usage" },
);
resourceUsageSchema.index({ organizationId: 1, periodStart: 1, periodEnd: 1 });
resourceUsageSchema.index({ reservationId: 1, periodStart: 1 });

const usageLedgerSchema = new Schema(
  {
    ...tenantAuditFields,
    projectId: {
      type: objectId,
      ref: "Project",
      default: null,
      immutable: true,
    },
    environmentId: {
      type: objectId,
      ref: "Environment",
      default: null,
      immutable: true,
    },
    reservationId: {
      type: objectId,
      ref: "ResourceReservation",
      default: null,
      immutable: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 160,
    },
    entryType: {
      type: String,
      enum: ["accrual", "adjustment", "credit"],
      required: true,
      immutable: true,
    },
    quantities: { type: reservableSchema, required: true, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { ...strictOptions, collection: "usage_ledger" },
);
usageLedgerSchema.index(
  { organizationId: 1, idempotencyKey: 1 },
  { unique: true },
);
usageLedgerSchema.index({ organizationId: 1, occurredAt: -1 });

const idempotencyRecordSchema = new Schema(
  {
    ...tenantAuditFields,
    scope: { type: String, required: true, immutable: true, maxlength: 80 },
    key: { type: String, required: true, immutable: true, maxlength: 160 },
    requestHash: {
      type: String,
      required: true,
      immutable: true,
      match: /^[a-f\d]{64}$/,
    },
    resourceType: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 80,
    },
    resourceId: { type: String, default: null, maxlength: 128 },
    status: {
      type: String,
      enum: ["started", "completed", "failed"],
      default: "started",
      required: true,
    },
    result: { type: Schema.Types.Mixed, default: null },
    expiresAt: { type: Date, required: true },
  },
  { ...strictOptions, collection: "idempotency_records" },
);
idempotencyRecordSchema.index(
  { organizationId: 1, scope: 1, key: 1 },
  { unique: true },
);
idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const outboxEventSchema = new Schema(
  {
    eventId: { type: String, required: true, immutable: true, maxlength: 80 },
    organizationId: {
      type: objectId,
      required: true,
      ref: "Organization",
      immutable: true,
    },
    aggregateType: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 80,
    },
    aggregateId: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 128,
    },
    eventType: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 120,
    },
    payload: { type: Schema.Types.Mixed, required: true, immutable: true },
    actorUserId: {
      type: objectId,
      required: true,
      ref: "User",
      immutable: true,
    },
    requestId: { type: String, required: true, immutable: true, maxlength: 80 },
    deduplicationKey: {
      type: String,
      default: null,
      immutable: true,
      maxlength: 255,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "published", "failed"],
      default: "pending",
      required: true,
    },
    attempts: { type: Number, default: 0, min: 0, required: true },
    availableAt: { type: Date, required: true },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null, maxlength: 128 },
    publishedAt: { type: Date, default: null },
    lastErrorCode: { type: String, default: null, maxlength: 80 },
    expiresAt: { type: Date, default: null },
  },
  { ...strictOptions, collection: "outbox_events" },
);
outboxEventSchema.index({ eventId: 1 }, { unique: true });
outboxEventSchema.index(
  { deduplicationKey: 1 },
  {
    unique: true,
    partialFilterExpression: { deduplicationKey: { $type: "string" } },
  },
);
outboxEventSchema.index({ status: 1, availableAt: 1, createdAt: 1 });
outboxEventSchema.index({
  organizationId: 1,
  aggregateType: 1,
  aggregateId: 1,
  createdAt: -1,
});
outboxEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

function existingModel<T>(name: string): Model<T> | undefined {
  return models[name] as Model<T> | undefined;
}

function stableModel<T>(name: string, schema: Schema): Model<T> {
  return existingModel<T>(name) ?? (model(name, schema) as unknown as Model<T>);
}

export const ProjectModel = stableModel<ProjectRecord>(
  "Project",
  projectSchema,
);
export const EnvironmentModel = stableModel<EnvironmentRecord>(
  "Environment",
  environmentSchema,
);
export const ServiceTemplateModel = stableModel<ServiceTemplateRecord>(
  "ServiceTemplate",
  serviceTemplateSchema,
);
export const ServiceDraftModel = stableModel<ServiceDraftRecord>(
  "ServiceDraft",
  serviceDraftSchema,
);
export const WorkerNodeModel = stableModel<WorkerNodeRecord>(
  "WorkerNode",
  workerNodeSchema,
);
export const WorkerCredentialModel = stableModel<WorkerCredentialRecord>(
  "WorkerCredential",
  workerCredentialSchema,
);
export const ResourceEntitlementModel = stableModel<ResourceEntitlementRecord>(
  "ResourceEntitlement",
  resourceEntitlementSchema,
);
export const ResourceReservationModel = stableModel<ResourceReservationRecord>(
  "ResourceReservation",
  resourceReservationSchema,
);
export const ResourceUsageModel = stableModel<ResourceUsageRecord>(
  "ResourceUsage",
  resourceUsageSchema,
);
export const UsageLedgerModel = stableModel<UsageLedgerRecord>(
  "UsageLedger",
  usageLedgerSchema,
);
export const IdempotencyRecordModel = stableModel<IdempotencyRecordDocument>(
  "IdempotencyRecord",
  idempotencyRecordSchema,
);
export const OutboxEventModel = stableModel<OutboxEventRecord>(
  "OutboxEvent",
  outboxEventSchema,
);

export type Project = ProjectRecord;
export type Environment = EnvironmentRecord;
export type ServiceTemplate = ServiceTemplateRecord;
export type ServiceDraft = ServiceDraftRecord;
export type WorkerNode = WorkerNodeRecord;
export type WorkerCredential = WorkerCredentialRecord;
export type ResourceEntitlement = ResourceEntitlementRecord;
export type ResourceReservation = ResourceReservationRecord;
export type ResourceUsage = ResourceUsageRecord;
export type UsageLedger = UsageLedgerRecord;
export type IdempotencyRecord = IdempotencyRecordDocument;
export type OutboxEvent = OutboxEventRecord;
export type {
  ReservableResources,
  ResourceEntitlements,
  ResourceQuotaCounters,
  ResourceQuotaLimits,
  WorkerResourceCapacity,
} from "@/server/domain/resources";
export type {
  NormalizedDesiredConfiguration,
  ServiceTemplateManifest,
  WizardValues,
} from "@/server/domain/service-template";
export { Types };
