import { enrollAgent, sendHeartbeat } from "../../worker/agent/client";

export default async function setupWorker(): Promise<void> {
  const controlPlaneUrl = requiredEnvironment("APP_URL");
  const statePath = requiredEnvironment("PLAYWRIGHT_WORKER_STATE_PATH");
  assertIsolatedDatabase();
  await enrollAgent({
    controlPlaneUrl,
    token: requiredEnvironment("PLAYWRIGHT_WORKER_ENROLLMENT_TOKEN"),
    name: requiredEnvironment("PLAYWRIGHT_WORKER_NAME"),
    region: "local-1",
    provider: "playwright-host",
    capabilities: ["phase-2-heartbeat"],
    concurrentOperations: 2,
    statePath,
    allowHttp: true,
  });
  await sendHeartbeat(statePath, true);
}

function assertIsolatedDatabase(): void {
  const databaseName = requiredEnvironment("PLAYWRIGHT_DATABASE_NAME");
  if (
    process.env.MONGODB_DB !== databaseName ||
    !/^dastack_e2e_[a-f0-9]{16}$/.test(databaseName)
  ) {
    throw new Error("E2E tests require an isolated disposable database.");
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required by the E2E worker setup.`);
  return value;
}
