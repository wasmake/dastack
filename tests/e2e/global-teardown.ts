import { unlink } from "node:fs/promises";

export default async function teardownWorker(): Promise<void> {
  const statePath = process.env.PLAYWRIGHT_WORKER_STATE_PATH;
  const databaseName = process.env.PLAYWRIGHT_DATABASE_NAME;
  if (
    !statePath ||
    !databaseName ||
    process.env.MONGODB_DB !== databaseName ||
    !/^dastack_e2e_[a-f0-9]{16}$/.test(databaseName)
  ) {
    throw new Error("Refusing to clean a non-E2E database.");
  }

  await unlink(statePath).catch((error: unknown) => {
    if (!isMissingFile(error)) throw error;
  });
}

function isMissingFile(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT",
  );
}
