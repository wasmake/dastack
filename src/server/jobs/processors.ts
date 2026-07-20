import type { Job } from "bullmq";

import { releaseStaleReservations } from "@/features/resources/reconciliation";
import {
  phaseTwoJobDataSchema,
  type PhaseTwoJobData,
} from "@/server/jobs/definitions";
import { logJobOutcome } from "@/server/jobs/logging";
import { WorkerNodeModel } from "@/server/db/control-plane-models";
import { connectMongoose } from "@/server/db/mongodb";
import {
  getWorkerPersistenceConfig,
  getWorkerReconciliationConfig,
} from "@/server/workers/env";

export async function processStaleReservations(
  job: Job<PhaseTwoJobData>,
): Promise<{ examined: number; released: number; failed: number }> {
  const data = phaseTwoJobDataSchema.parse(job.data);
  const persistence = getWorkerPersistenceConfig();
  const reconciliation = getWorkerReconciliationConfig();
  await connectMongoose();
  const result = await releaseStaleReservations({
    actorUserId: persistence.WORKER_SYSTEM_ACTOR_ID,
    now: new Date(),
    limit: reconciliation.WORKER_RECONCILIATION_BATCH_SIZE,
  });
  logJobOutcome({
    level: result.failed > 0 ? "error" : "info",
    event: "jobs.stale_reservations_reconciled",
    queue: "resource-reconciliation",
    jobId: job.id ?? "unknown",
    requestId: data.requestId,
    correlationId: data.correlationId,
    outcome: result.failed > 0 ? "failed" : "completed",
    counts: result,
    ...(result.failed > 0 ? { errorCode: "PARTIAL_RECONCILIATION" } : {}),
  });
  if (result.failed > 0) {
    throw new Error("One or more stale reservations could not be released.");
  }
  return result;
}

export async function processDisconnectedWorkers(
  job: Job<PhaseTwoJobData>,
): Promise<{ disconnected: number }> {
  const data = phaseTwoJobDataSchema.parse(job.data);
  const persistence = getWorkerPersistenceConfig();
  const reconciliation = getWorkerReconciliationConfig();
  await connectMongoose();
  const cutoff = new Date(
    Date.now() - reconciliation.WORKER_DISCONNECT_AFTER_SECONDS * 1_000,
  );
  const result = await WorkerNodeModel.updateMany(
    {
      status: { $in: ["online", "draining"] },
      lastHeartbeatAt: { $lte: cutoff },
    },
    {
      $set: {
        status: "offline",
        schedulable: false,
        updatedBy: persistence.WORKER_SYSTEM_ACTOR_ID,
      },
    },
  );
  const outcome = { disconnected: result.modifiedCount };
  logJobOutcome({
    level: "info",
    event: "jobs.disconnected_workers_detected",
    queue: "worker-cleanup",
    jobId: job.id ?? "unknown",
    requestId: data.requestId,
    correlationId: data.correlationId,
    outcome: "completed",
    counts: outcome,
  });
  return outcome;
}
