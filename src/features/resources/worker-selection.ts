import type { ClientSession } from "mongoose";

import {
  WorkerNodeModel,
  type WorkerNodeRecord,
} from "@/server/db/control-plane-models";
import type {
  ReservableResources,
  WorkerResourceCapacity,
} from "@/server/domain/resources";

export const WORKER_HEARTBEAT_MAX_AGE_MS = 2 * 60 * 1_000;

export type WorkerCandidate = Pick<
  WorkerNodeRecord,
  | "_id"
  | "providerNodeId"
  | "region"
  | "status"
  | "schedulable"
  | "lastHeartbeatAt"
  | "capacity"
  | "reserved"
  | "allocated"
>;

const workerKeys = [
  "cpuMillicores",
  "memoryMiB",
  "storageGiB",
  "concurrentOperations",
] as const;

export function toWorkerResources(
  resources: ReservableResources,
): WorkerResourceCapacity {
  return {
    cpuMillicores: resources.cpuMillicores,
    memoryMiB: resources.memoryMiB,
    storageGiB: resources.storageGiB,
    concurrentOperations: resources.concurrentOperations,
  };
}

export function workerHasCapacity(
  worker: Pick<WorkerCandidate, "capacity" | "reserved" | "allocated">,
  requested: WorkerResourceCapacity,
): boolean {
  return workerKeys.every(
    (key) =>
      worker.reserved[key] + worker.allocated[key] + requested[key] <=
      worker.capacity[key],
  );
}

function loadScore(worker: WorkerCandidate): number {
  return workerKeys.reduce((score, key) => {
    const capacity = worker.capacity[key];
    if (capacity === 0) return score + 1;
    return score + (worker.reserved[key] + worker.allocated[key]) / capacity;
  }, 0);
}

export function rankWorkerCandidates(
  workers: WorkerCandidate[],
  requested: WorkerResourceCapacity,
  now = new Date(),
): WorkerCandidate[] {
  const heartbeatCutoff = now.getTime() - WORKER_HEARTBEAT_MAX_AGE_MS;
  return workers
    .filter(
      (worker) =>
        worker.status === "online" &&
        worker.schedulable &&
        worker.lastHeartbeatAt.getTime() > heartbeatCutoff &&
        workerHasCapacity(worker, requested),
    )
    .sort(
      (left, right) =>
        loadScore(left) - loadScore(right) ||
        left.providerNodeId.localeCompare(right.providerNodeId),
    );
}

export async function hasSchedulableWorkerInRegion(
  region: string,
  now = new Date(),
  session?: ClientSession,
): Promise<boolean> {
  const query = WorkerNodeModel.exists({
    region,
    status: "online",
    schedulable: true,
    lastHeartbeatAt: {
      $gt: new Date(now.getTime() - WORKER_HEARTBEAT_MAX_AGE_MS),
    },
  });
  if (session) query.session(session);
  return Boolean(await query);
}

export async function selectWorkerCandidates(input: {
  region: string;
  resources: ReservableResources;
  providerNodeId?: string;
  now?: Date;
  session: ClientSession;
}): Promise<WorkerCandidate[]> {
  const now = input.now ?? new Date();
  const workers = await WorkerNodeModel.find({
    region: input.region,
    status: "online",
    schedulable: true,
    lastHeartbeatAt: {
      $gt: new Date(now.getTime() - WORKER_HEARTBEAT_MAX_AGE_MS),
    },
    ...(input.providerNodeId ? { providerNodeId: input.providerNodeId } : {}),
  })
    .session(input.session)
    .lean<WorkerCandidate[]>();
  return rankWorkerCandidates(workers, toWorkerResources(input.resources), now);
}
