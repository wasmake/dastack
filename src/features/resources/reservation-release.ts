import { Types } from "mongoose";

import { writeAudit } from "@/server/audit";
import { reservationQuotaDelta } from "@/features/resources/quota";
import { transitionReservationState } from "@/features/resources/reservation-state";
import { toWorkerResources } from "@/features/resources/worker-selection";
import {
  ResourceEntitlementModel,
  ResourceReservationModel,
  WorkerNodeModel,
  type ResourceReservationRecord,
} from "@/server/db/control-plane-models";
import { createOutboxEvent } from "@/server/domain/outbox";
import type {
  ResourceQuotaCounters,
  WorkerResourceCapacity,
} from "@/server/domain/resources";
import { runTransaction } from "@/server/domain/transactions";
import { AppError } from "@/server/security/errors";

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

export async function releaseReservationInternal(input: {
  organizationId: string;
  reservationId: string;
  reason: "requested" | "stale" | "failed";
  actorUserId: string;
  requestId: string;
  ipHash?: string | null;
}): Promise<{ reservation: ResourceReservationRecord; changed: boolean }> {
  return runTransaction(async (session) => {
    const reservation = await ResourceReservationModel.findOne({
      _id: input.reservationId,
      organizationId: input.organizationId,
    }).session(session);
    if (!reservation) {
      throw new AppError(
        404,
        "RESERVATION_NOT_FOUND",
        "The resource reservation was not found.",
      );
    }
    if (input.reason === "stale" && reservation.status !== "reserved") {
      return {
        reservation: reservation.toObject() as ResourceReservationRecord,
        changed: false,
      };
    }
    const transition = transitionReservationState(
      reservation.status,
      "release",
    );
    if (!transition.changed) {
      return {
        reservation: reservation.toObject() as ResourceReservationRecord,
        changed: false,
      };
    }
    const counter =
      reservation.status === "reserved" ? "reserved" : "allocated";
    const quotaDelta = reservationQuotaDelta(reservation.resources);
    const workerResources = toWorkerResources(reservation.resources);
    const entitlement = await ResourceEntitlementModel.findOneAndUpdate(
      {
        organizationId: input.organizationId,
        $expr: nonnegativeExpression(counter, quotaDelta),
      },
      {
        $inc: incDocument(counter, quotaDelta, -1),
        $set: { updatedBy: input.actorUserId },
      },
      { returnDocument: "after", session },
    );
    const worker = await WorkerNodeModel.findOneAndUpdate(
      {
        _id: reservation.workerId,
        providerNodeId: reservation.workerNodeId,
        $expr: nonnegativeExpression(counter, workerResources),
      },
      {
        $inc: incDocument(counter, workerResources, -1),
        $set: { updatedBy: input.actorUserId },
      },
      { returnDocument: "after", session },
    );
    if (!entitlement || !worker) {
      throw new AppError(
        409,
        "RESERVATION_COUNTER_MISMATCH",
        "The reservation counters could not be released safely.",
      );
    }
    reservation.status = transition.next;
    reservation.releasedAt = new Date();
    reservation.releaseReason = input.reason;
    reservation.updatedBy = new Types.ObjectId(input.actorUserId);
    await reservation.save({ session });
    await createOutboxEvent(
      {
        organizationId: input.organizationId,
        aggregateType: "resource_reservation",
        aggregateId: reservation._id,
        eventType: "resource.reservation_released",
        payload: {
          reservationId: input.reservationId,
          projectId: reservation.projectId.toString(),
          environmentId: reservation.environmentId.toString(),
          workerNodeId: reservation.workerNodeId,
          reason: input.reason,
        },
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        deduplicationKey: `reservation:${input.reservationId}:released`,
      },
      session,
    );
    await writeAudit(
      {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action:
          input.reason === "stale"
            ? "resource.reservation_released_stale"
            : "resource.reservation_released",
        targetType: "resource_reservation",
        targetId: input.reservationId,
        requestId: input.requestId,
        ipHash: input.ipHash,
        metadata: {
          projectId: reservation.projectId.toString(),
          environmentId: reservation.environmentId.toString(),
          workerNodeId: reservation.workerNodeId,
          reason: input.reason,
        },
      },
      session,
    );
    return {
      reservation: reservation.toObject() as ResourceReservationRecord,
      changed: true,
    };
  });
}
