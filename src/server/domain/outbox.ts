import { nanoid } from "nanoid";
import type { ClientSession, Types } from "mongoose";

import { OutboxEventModel } from "@/server/db/control-plane-models";

export async function createOutboxEvent(
  input: {
    organizationId: Types.ObjectId | string;
    aggregateType: string;
    aggregateId: Types.ObjectId | string;
    eventType: string;
    payload: Record<string, unknown>;
    actorUserId: Types.ObjectId | string;
    requestId: string;
    deduplicationKey?: string;
  },
  session: ClientSession,
): Promise<void> {
  await OutboxEventModel.create(
    [
      {
        eventId: nanoid(24),
        organizationId: input.organizationId,
        aggregateType: input.aggregateType,
        aggregateId: String(input.aggregateId),
        eventType: input.eventType,
        payload: input.payload,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        deduplicationKey: input.deduplicationKey ?? null,
        status: "pending",
        attempts: 0,
        availableAt: new Date(),
      },
    ],
    { session },
  );
}
