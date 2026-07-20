import { createHash, randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";

import { MongoClient } from "mongodb";

import { scopedMongoUri } from "./e2e-mongo-uri";

const enrollmentToken = randomBytes(32).toString("base64url");
const runId = randomBytes(8).toString("hex");
const appPort = e2ePort();
const appUrl = `http://localhost:${appPort}`;
const databaseName = `dastack_e2e_${runId}`;
const databaseUsername = `e2e_${runId}`;
const databasePassword = randomBytes(32).toString("base64url");
const lifecycleMongoUri = e2eMongoUri();
const applicationMongoUri = scopedMongoUri(
  lifecycleMongoUri,
  databaseUsername,
  databasePassword,
  databaseName,
);
const artifactDirectory = path.resolve(`.local/playwright/${runId}`);
const environment = {
  ...process.env,
  APP_URL: appUrl,
  AUTH_URL: appUrl,
  NEXT_PUBLIC_APP_URL: appUrl,
  PORT: String(appPort),
  MONGODB_URI: applicationMongoUri,
  MONGODB_INTERNAL_URI: "",
  MONGODB_DB: databaseName,
  MONGO_ROOT_USERNAME: "",
  MONGO_ROOT_PASSWORD: "",
  E2E_MONGODB_URI: "",
  EMAIL_DEV_DIR: path.join(artifactDirectory, "emails"),
  PLAYWRIGHT_DATABASE_NAME: databaseName,
  PLAYWRIGHT_WORKER_ENROLLMENT_TOKEN: enrollmentToken,
  PLAYWRIGHT_WORKER_NAME: `playwright-worker-${runId}`,
  PLAYWRIGHT_WORKER_STATE_PATH: path.join(artifactDirectory, "worker.json"),
  WORKER_ALLOW_INSECURE_HTTP: "true",
  WORKER_CREDENTIAL_TTL_SECONDS: "3600",
  WORKER_ENROLLMENT_TOKEN_DIGEST: createHash("sha256")
    .update(enrollmentToken, "utf8")
    .digest("hex"),
  WORKER_SYSTEM_ACTOR_ID: "000000000000000000000001",
  WORKER_SYSTEM_ORGANIZATION_ID: "000000000000000000000002",
};

function e2eMongoUri(): string {
  if (process.env.E2E_MONGODB_URI) return process.env.E2E_MONGODB_URI;
  const username = process.env.MONGO_ROOT_USERNAME;
  const password = process.env.MONGO_ROOT_PASSWORD;
  const port = process.env.MONGO_PORT ?? "27017";
  if (
    !username ||
    !password ||
    !/^\d{1,5}$/.test(port) ||
    Number(port) > 65_535
  ) {
    throw new Error(
      "E2E_MONGODB_URI or valid local Mongo root credentials are required for isolated E2E cleanup.",
    );
  }
  return `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@127.0.0.1:${port}/admin?authSource=admin&replicaSet=rs0&directConnection=true`;
}

function e2ePort(): number {
  const value = process.env.E2E_PORT ?? "3000";
  if (!/^\d{4,5}$/.test(value) || Number(value) > 65_535) {
    throw new Error("E2E_PORT must be a valid unprivileged TCP port.");
  }
  return Number(value);
}

async function run(): Promise<void> {
  let child: ChildProcess | undefined;
  let requestedSignal: NodeJS.Signals | null = null;
  let forcedTermination: NodeJS.Timeout | undefined;
  let result: { code: number | null; signal: NodeJS.Signals | null } = {
    code: 1,
    signal: null,
  };
  const signalHandlers = new Map<NodeJS.Signals, () => void>();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    const handler = () => {
      requestedSignal = signal;
      result = { code: null, signal };
      process.exitCode = 1;
      if (!child) return;
      terminateChild(child, signal);
      forcedTermination = setTimeout(
        () => terminateChild(child!, "SIGKILL"),
        10_000,
      );
      forcedTermination.unref();
    };
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }
  try {
    await prepareDatabase();
    if (requestedSignal) {
      result = { code: null, signal: requestedSignal };
      return;
    }
    child = spawn(
      "pnpm",
      ["exec", "playwright", "test", ...playwrightArguments()],
      {
        cwd: process.cwd(),
        env: environment,
        stdio: "inherit",
        detached: process.platform !== "win32",
      },
    );

    result = await new Promise((resolve, reject) => {
      child!.once("error", reject);
      child!.once("exit", (code, signal) => resolve({ code, signal }));
    });
  } finally {
    if (forcedTermination) clearTimeout(forcedTermination);
    if (child) terminateChild(child, "SIGKILL");
    try {
      await cleanup();
    } finally {
      for (const [signal, handler] of signalHandlers) {
        process.removeListener(signal, handler);
      }
    }
  }

  process.exitCode = result.signal ? 1 : (result.code ?? 1);
}

function playwrightArguments(): string[] {
  const arguments_ = process.argv.slice(2);
  return arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
}

async function prepareDatabase(): Promise<void> {
  const client = new MongoClient(lifecycleMongoUri, {
    serverSelectionTimeoutMS: 5_000,
  });
  try {
    await client.connect();
    await client.db(databaseName).command({
      createUser: databaseUsername,
      pwd: databasePassword,
      roles: [{ role: "readWrite", db: databaseName }],
    });
  } finally {
    await client.close();
  }
}

async function cleanup(): Promise<void> {
  if (!/^dastack_e2e_[a-f0-9]{16}$/.test(databaseName)) {
    throw new Error("Refusing to clean a non-E2E database.");
  }
  const failures: unknown[] = [];
  const client = new MongoClient(lifecycleMongoUri, {
    serverSelectionTimeoutMS: 5_000,
  });
  try {
    await client.connect();
    await client.db(databaseName).dropDatabase();
  } catch (error) {
    failures.push(error);
  } finally {
    await client.close().catch((error: unknown) => failures.push(error));
  }
  await rm(artifactDirectory, { recursive: true, force: true }).catch(
    (error: unknown) => failures.push(error),
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, "E2E cleanup failed.");
  }
}

function terminateChild(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (!isMissingProcess(error)) throw error;
    }
  }
  child.kill(signal);
}

function isMissingProcess(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ESRCH",
  );
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "E2E runner failed.");
  process.exitCode = 1;
});
