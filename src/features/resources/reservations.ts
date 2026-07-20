import { createHash } from "node:crypto";

import { Types } from "mongoose";

import { findActiveEnvironment } from "@/features/environments/service";
import { PERMISSIONS } from "@/features/organizations/permissions";
import { findActiveProject } from "@/features/projects/service";
import {
  quotaExceeded,
  quotaKeys,
  reservableKeys,
  reservationQuotaDelta,
} from "@/features/resources/quota";
import {
  idempotencyKeySchema,
  releaseResourceSchema,
  reserveResourceSchema,
} from "@/features/resources/schemas";
import { transitionReservationState } from "@/features/resources/reservation-state";
import { releaseReservationInternal } from "@/features/resources/reservation-release";
import {
  selectWorkerCandidates,
  toWorkerResources,
  WORKER_HEARTBEAT_MAX_AGE_MS,
} from "@/features/resources/worker-selection";
import { writeAudit } from "@/server/audit";
import {
  requireOrganizationPermission,
  type AuthorizedUser,
} from "@/server/authorization";
import {
  EnvironmentModel,
  IdempotencyRecordModel,
  ProjectModel,
  ResourceEntitlementModel,
  ResourceReservationModel,
  WorkerNodeModel,
  type ResourceEntitlementRecord,
  type ResourceReservationRecord,
} from "@/server/db/control-plane-models";
import { createOutboxEvent } from "@/server/domain/outbox";
import type {
  ResourceQuotaCounters,
  WorkerResourceCapacity,
} from "@/server/domain/resources";
import { runTransaction } from "@/server/domain/transactions";
import { AppError } from "@/server/security/errors";
import type { RequestContext } from "@/server/security/request";

const RESERVATION_TTL_MS = 15 * 60 * 1_000;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 11000,
  );
}

function hashRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function serializeReservation(reservation: ResourceReservationRecord) {
  return {
    id: reservation._id.toString(),
    organizationId: reservation.organizationId.toString(),
    projectId: reservation.projectId.toString(),
    environmentId: reservation.environmentId.toString(),
    workerNodeId: reservation.workerNodeId,
    resources: reservation.resources,
    status: reservation.status,
    expiresAt: reservation.expiresAt,
    confirmedAt: reservation.confirmedAt,
    releasedAt: reservation.releasedAt,
    releaseReason: reservation.releaseReason,
    createdAt: reservation.createdAt,
    version: reservation.__v,
  };
}

function billingIsOperable(
  entitlement: Pick<
    ResourceEntitlementRecord,
    "status" | "billingStatus" | "validFrom" | "validUntil"
  >,
  now: Date,
): boolean {
  return (
    entitlement.status === "active" &&
    ["active", "trialing"].includes(entitlement.billingStatus) &&
    entitlement.validFrom <= now &&
    (!entitlement.validUntil || entitlement.validUntil > now)
  );
}

function entitlementCapacityExpression(
  delta: ResourceQuotaCounters,
  counts: { projects: number; environments: number },
) {
  return {
    $and: quotaKeys.map((key) => {
      const current =
        key === "projects"
          ? counts.projects
          : key === "environments"
            ? counts.environments
            : { $add: [`$reserved.${key}`, `$allocated.${key}`] };
      return { $lte: [{ $add: [current, delta[key]] }, `$limits.${key}`] };
    }),
  };
}

function workerCapacityExpression(resources: WorkerResourceCapacity) {
  return {
    $and: Object.entries(resources).map(([key, amount]) => ({
      $lte: [
        { $add: [`$reserved.${key}`, `$allocated.${key}`, amount] },
        `$capacity.${key}`,
      ],
    })),
  };
}

function incDocument(
  prefix: "reserved" | "allocated",
  values: ResourceQuotaCounters | WorkerResourceCapacity,
  direction: 1 | -1,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      `${prefix}.${key}`,
      value * direction,
    ]),
  );
}

function nonnegativeExpression(
  prefix: "reserved" | "allocated",
  values: ResourceQuotaCounters | WorkerResourceCapacity,
) {
  return {
    $and: Object.entries(values).map(([key, amount]) => ({
      $gte: [`$${prefix}.${key}`, amount],
    })),
  };
}

async function loadReservation(
  organizationId: string,
  reservationId: string,
): Promise<ResourceReservationRecord> {
  const reservation = await ResourceReservationModel.findOne({
    _id: reservationId,
    organizationId,
  }).lean<ResourceReservationRecord>();
  if (!reservation) {
    throw new AppError(
      404,
      "RESERVATION_NOT_FOUND",
      "The resource reservation was not found.",
    );
  }
  return reservation;
}

async function assertReservationTenantAccess(
  reservation: ResourceReservationRecord,
  actorId: string,
  permission:
    typeof PERMISSIONS.SERVICE_CREATE | typeof PERMISSIONS.SERVICE_LIFECYCLE,
): Promise<void> {
  const organizationId = reservation.organizationId.toString();
  const projectId = reservation.projectId.toString();
  const environmentId = reservation.environmentId.toString();
  await requireOrganizationPermission(actorId, organizationId, permission);
  await findActiveProject(organizationId, projectId);
  await findActiveEnvironment(organizationId, projectId, environmentId);
}

async function existingIdempotentReservation(
  organizationId: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<ResourceReservationRecord | null> {
  const existing = await ResourceReservationModel.findOne({
    organizationId,
    idempotencyKey,
  }).lean<ResourceReservationRecord>();
  if (existing && existing.requestHash !== requestHash) {
    throw new AppError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "The idempotency key was already used for another request.",
    );
  }
  return existing;
}

export async function reserveResource(
  organizationId: string,
  rawInput: unknown,
  rawIdempotencyKey: string,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  const input = reserveResourceSchema.parse(rawInput);
  const idempotencyKey = idempotencyKeySchema.parse(rawIdempotencyKey);
  await requireOrganizationPermission(
    actor.id,
    organizationId,
    PERMISSIONS.SERVICE_CREATE,
  );
  await findActiveProject(organizationId, input.projectId);
  await findActiveEnvironment(
    organizationId,
    input.projectId,
    input.environmentId,
  );
  const requestHash = hashRequest(input);
  const existing = await existingIdempotentReservation(
    organizationId,
    idempotencyKey,
    requestHash,
  );
  if (existing) return serializeReservation(existing);

  let result: { reservation: ResourceReservationRecord; created: boolean };
  try {
    result = await runTransaction(async (session) => {
      const replay = await ResourceReservationModel.findOne({
        organizationId,
        idempotencyKey,
      }).session(session);
      if (replay) {
        if (replay.requestHash !== requestHash) {
          throw new AppError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "The idempotency key was already used for another request.",
          );
        }
        return {
          reservation: replay.toObject() as ResourceReservationRecord,
          created: false,
        };
      }

      await findActiveProject(organizationId, input.projectId, session);
      const transactionalEnvironment = await findActiveEnvironment(
        organizationId,
        input.projectId,
        input.environmentId,
        session,
      );
      const guardedEnvironment = await EnvironmentModel.updateOne(
        {
          _id: input.environmentId,
          organizationId,
          projectId: input.projectId,
          status: "active",
        },
        {
          $inc: { reservationRevision: 1 },
          $set: { updatedBy: actor.id },
        },
        { session },
      );
      if (guardedEnvironment.matchedCount !== 1) {
        throw new AppError(
          404,
          "ENVIRONMENT_NOT_FOUND",
          "The environment was not found.",
        );
      }
      const now = new Date();
      const entitlement = await ResourceEntitlementModel.findOne({
        organizationId,
      })
        .session(session)
        .lean<ResourceEntitlementRecord>();
      if (!entitlement || !billingIsOperable(entitlement, now)) {
        throw new AppError(
          409,
          "ENTITLEMENT_NOT_OPERABLE",
          "The organization's billing entitlement is not active.",
        );
      }
      const [projects, environments] = await Promise.all([
        ProjectModel.countDocuments({
          organizationId,
          status: "active",
        }).session(session),
        EnvironmentModel.countDocuments({
          organizationId,
          status: "active",
        }).session(session),
      ]);
      const counts = { projects, environments };
      const quotaDelta = reservationQuotaDelta(input.resources);
      const exceeded = quotaExceeded(
        entitlement.limits,
        entitlement.reserved,
        entitlement.allocated,
        quotaDelta,
        counts,
      );
      if (exceeded) {
        throw new AppError(
          409,
          "RESOURCE_QUOTA_EXCEEDED",
          `The ${exceeded} resource quota would be exceeded.`,
        );
      }

      const updatedEntitlement =
        await ResourceEntitlementModel.findOneAndUpdate(
          {
            _id: entitlement._id,
            organizationId,
            status: "active",
            billingStatus: { $in: ["active", "trialing"] },
            validFrom: { $lte: now },
            $and: [
              { $or: [{ validUntil: null }, { validUntil: { $gt: now } }] },
              { $expr: entitlementCapacityExpression(quotaDelta, counts) },
            ],
          },
          {
            $inc: incDocument("reserved", quotaDelta, 1),
            $set: { updatedBy: actor.id },
          },
          { returnDocument: "after", session },
        );
      if (!updatedEntitlement) {
        throw new AppError(
          409,
          "RESOURCE_QUOTA_EXCEEDED",
          "The resource quota changed before the reservation completed.",
        );
      }

      const candidates = await selectWorkerCandidates({
        region: transactionalEnvironment.region,
        resources: input.resources,
        providerNodeId: input.workerNodeId,
        now,
        session,
      });
      const workerResources = toWorkerResources(input.resources);
      let selected = null;
      for (const candidate of candidates) {
        selected = await WorkerNodeModel.findOneAndUpdate(
          {
            _id: candidate._id,
            providerNodeId: candidate.providerNodeId,
            region: transactionalEnvironment.region,
            status: "online",
            schedulable: true,
            lastHeartbeatAt: {
              $gt: new Date(now.getTime() - WORKER_HEARTBEAT_MAX_AGE_MS),
            },
            $expr: workerCapacityExpression(workerResources),
          },
          {
            $inc: incDocument("reserved", workerResources, 1),
            $set: { updatedBy: actor.id },
          },
          { returnDocument: "after", session },
        );
        if (selected) break;
      }
      if (!selected) {
        throw new AppError(
          409,
          "WORKER_CAPACITY_UNAVAILABLE",
          "No online worker in the environment region has enough capacity.",
        );
      }

      const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);
      const reservation = (
        await ResourceReservationModel.create(
          [
            {
              organizationId,
              projectId: input.projectId,
              environmentId: input.environmentId,
              workerId: selected._id,
              workerNodeId: selected.providerNodeId,
              idempotencyKey,
              requestHash,
              resources: input.resources,
              serviceCount: 1,
              status: "reserved",
              expiresAt,
              createdBy: actor.id,
              updatedBy: actor.id,
            },
          ],
          { session },
        )
      )[0];
      await IdempotencyRecordModel.create(
        [
          {
            organizationId,
            scope: "resource-reservation",
            key: idempotencyKey,
            requestHash,
            resourceType: "resource_reservation",
            resourceId: reservation._id.toString(),
            status: "completed",
            expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        ],
        { session },
      );
      await createOutboxEvent(
        {
          organizationId,
          aggregateType: "resource_reservation",
          aggregateId: reservation._id,
          eventType: "resource.reserved",
          payload: {
            reservationId: reservation._id.toString(),
            projectId: input.projectId,
            environmentId: input.environmentId,
            workerNodeId: selected.providerNodeId,
          },
          actorUserId: actor.id,
          requestId: context.requestId,
          deduplicationKey: `reservation:${organizationId}:${idempotencyKey}:reserved`,
        },
        session,
      );
      await writeAudit(
        {
          organizationId,
          actorUserId: actor.id,
          action: "resource.reserved",
          targetType: "resource_reservation",
          targetId: reservation._id.toString(),
          requestId: context.requestId,
          ipHash: context.ipHash,
          metadata: {
            projectId: input.projectId,
            environmentId: input.environmentId,
            workerNodeId: selected.providerNodeId,
          },
        },
        session,
      );
      return {
        reservation: reservation.toObject() as ResourceReservationRecord,
        created: true,
      };
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const replay = await existingIdempotentReservation(
        organizationId,
        idempotencyKey,
        requestHash,
      );
      if (replay) return serializeReservation(replay);
    }
    throw error;
  }

  return serializeReservation(result.reservation);
}

export async function getResourceReservation(
  organizationId: string,
  reservationId: string,
  actorId: string,
) {
  await requireOrganizationPermission(
    actorId,
    organizationId,
    PERMISSIONS.PROJECT_VIEW,
  );
  const reservation = await loadReservation(organizationId, reservationId);
  await findActiveProject(organizationId, reservation.projectId.toString());
  await findActiveEnvironment(
    organizationId,
    reservation.projectId.toString(),
    reservation.environmentId.toString(),
  );
  return serializeReservation(reservation);
}

export async function confirmResourceReservation(
  organizationId: string,
  reservationId: string,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  const existing = await loadReservation(organizationId, reservationId);
  await assertReservationTenantAccess(
    existing,
    actor.id,
    PERMISSIONS.SERVICE_LIFECYCLE,
  );
  const result = await runTransaction(async (session) => {
    const reservation = await ResourceReservationModel.findOne({
      _id: reservationId,
      organizationId,
    }).session(session);
    if (!reservation) {
      throw new AppError(
        404,
        "RESERVATION_NOT_FOUND",
        "The resource reservation was not found.",
      );
    }
    const transition = transitionReservationState(
      reservation.status,
      "confirm",
    );
    if (!transition.changed) {
      return {
        reservation: reservation.toObject() as ResourceReservationRecord,
        changed: false,
      };
    }
    const now = new Date();
    if (reservation.expiresAt <= now) {
      throw new AppError(
        409,
        "RESERVATION_EXPIRED",
        "The resource reservation expired and must be released.",
      );
    }
    const quotaDelta = reservationQuotaDelta(reservation.resources);
    const workerResources = toWorkerResources(reservation.resources);
    const entitlement = await ResourceEntitlementModel.findOneAndUpdate(
      {
        organizationId,
        status: "active",
        billingStatus: { $in: ["active", "trialing"] },
        validFrom: { $lte: now },
        $and: [
          { $or: [{ validUntil: null }, { validUntil: { $gt: now } }] },
          { $expr: nonnegativeExpression("reserved", quotaDelta) },
        ],
      },
      {
        $inc: {
          ...incDocument("reserved", quotaDelta, -1),
          ...incDocument("allocated", quotaDelta, 1),
        },
        $set: { updatedBy: actor.id },
      },
      { returnDocument: "after", session },
    );
    const worker = await WorkerNodeModel.findOneAndUpdate(
      {
        _id: reservation.workerId,
        providerNodeId: reservation.workerNodeId,
        $expr: nonnegativeExpression("reserved", workerResources),
      },
      {
        $inc: {
          ...incDocument("reserved", workerResources, -1),
          ...incDocument("allocated", workerResources, 1),
        },
        $set: { updatedBy: actor.id },
      },
      { returnDocument: "after", session },
    );
    if (!entitlement || !worker) {
      throw new AppError(
        409,
        "RESERVATION_COUNTER_MISMATCH",
        "The reservation counters could not be confirmed safely.",
      );
    }
    reservation.status = transition.next;
    reservation.confirmedAt = new Date();
    reservation.updatedBy = new Types.ObjectId(actor.id);
    await reservation.save({ session });
    await createOutboxEvent(
      {
        organizationId,
        aggregateType: "resource_reservation",
        aggregateId: reservation._id,
        eventType: "resource.reservation_confirmed",
        payload: {
          reservationId,
          projectId: reservation.projectId.toString(),
          environmentId: reservation.environmentId.toString(),
          workerNodeId: reservation.workerNodeId,
        },
        actorUserId: actor.id,
        requestId: context.requestId,
        deduplicationKey: `reservation:${reservationId}:confirmed`,
      },
      session,
    );
    await writeAudit(
      {
        organizationId,
        actorUserId: actor.id,
        action: "resource.reservation_confirmed",
        targetType: "resource_reservation",
        targetId: reservationId,
        requestId: context.requestId,
        ipHash: context.ipHash,
        metadata: {
          projectId: reservation.projectId.toString(),
          environmentId: reservation.environmentId.toString(),
          workerNodeId: reservation.workerNodeId,
        },
      },
      session,
    );
    return {
      reservation: reservation.toObject() as ResourceReservationRecord,
      changed: true,
    };
  });

  return serializeReservation(result.reservation);
}

export async function releaseResourceReservation(
  organizationId: string,
  reservationId: string,
  rawInput: unknown,
  actor: AuthorizedUser,
  context: RequestContext,
) {
  const input = releaseResourceSchema.parse(rawInput);
  const existing = await loadReservation(organizationId, reservationId);
  await assertReservationTenantAccess(
    existing,
    actor.id,
    PERMISSIONS.SERVICE_LIFECYCLE,
  );
  const result = await releaseReservationInternal({
    organizationId,
    reservationId,
    reason: input.reason,
    actorUserId: actor.id,
    requestId: context.requestId,
    ipHash: context.ipHash,
  });
  return serializeReservation(result.reservation);
}

export const reservationResourceKeys = reservableKeys;
