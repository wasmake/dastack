import { sendHeartbeat } from "../../../worker/agent/client";

export async function heartbeatE2eWorker(): Promise<void> {
  const statePath = process.env.PLAYWRIGHT_WORKER_STATE_PATH;
  if (!statePath) {
    throw new Error("PLAYWRIGHT_WORKER_STATE_PATH is required for E2E tests.");
  }
  await sendHeartbeat(statePath, true);
}
