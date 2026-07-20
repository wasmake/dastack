export type DisconnectableWorkerState = {
  status: "online" | "offline" | "draining" | "disabled";
  schedulable: boolean;
  lastHeartbeatAt: Date;
};

export function disconnectedWorkerTransition(
  worker: DisconnectableWorkerState,
  now: Date,
  heartbeatTimeoutMs: number,
): {
  status: DisconnectableWorkerState["status"];
  schedulable: boolean;
} | null {
  if (
    !["online", "draining"].includes(worker.status) ||
    worker.lastHeartbeatAt.getTime() > now.getTime() - heartbeatTimeoutMs
  ) {
    return null;
  }
  return { status: "offline", schedulable: false };
}
