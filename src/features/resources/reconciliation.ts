import { Types } from "mongoose";

import {
  ResourceReservationModel,
  type ResourceReservationRecord,
} from "@/server/db/control-plane-models";
import { AppError } from "@/server/security/errors";
import { releaseReservationInternal } from "@/features/resources/reservation-release";

export async function releaseStaleReservations(input: {
  actorUserId: string;
  now?: Date;
  limit?: number;
}): Promise<{ examined: number; released: number; failed: number }> {
  if (!Types.ObjectId.isValid(input.actorUserId)) {
    throw new AppError(
      400,
      "INVALID_ACTOR",
      "A valid reconciler actor is required.",
    );
  }
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 1_000);
  const stale = await ResourceReservationModel.find({
    status: "reserved",
    expiresAt: { $lte: now },
  })
    .sort({ expiresAt: 1, _id: 1 })
    .limit(limit)
    .lean<ResourceReservationRecord[]>();
  let released = 0;
  let failed = 0;
  for (const reservation of stale) {
    try {
      const requestId = `stale-reconciler-${reservation._id.toString()}`;
      const result = await releaseReservationInternal({
        organizationId: reservation.organizationId.toString(),
        reservationId: reservation._id.toString(),
        reason: "stale",
        actorUserId: input.actorUserId,
        requestId,
      });
      if (result.changed) {
        released += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return { examined: stale.length, released, failed };
}
