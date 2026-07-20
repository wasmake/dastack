import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";

import { Worker } from "bullmq";
import mongoose from "mongoose";
import type Redis from "ioredis";

import type { PhaseTwoJobData } from "@/server/jobs/definitions";
import {
  processDisconnectedWorkers,
  processStaleReservations,
} from "@/server/jobs/processors";
import {
  closeQueueRegistry,
  closeBullRedisConnection,
  createBullRedisConnection,
  createBullRedisOptions,
  initializeQueueRegistry,
  jobQueuePrefix,
  upsertRegisteredJobScheduler,
} from "@/server/jobs/registry";
import { getJobRunnerConfig } from "@/server/workers/env";
import { redactSecrets } from "@/server/security/redact";

type RunningJobRunner = {
  close: () => Promise<void>;
  ready: () => boolean;
};

export async function startJobRunner(
  signal?: AbortSignal,
): Promise<RunningJobRunner> {
  signal?.throwIfAborted();
  const config = getJobRunnerConfig();
  let isReady = false;
  let isClosing = false;
  let startupComplete = false;
  const unhealthyResources = new Set<string>();
  const workers: Worker<PhaseTwoJobData>[] = [];
  let healthServer: Server | undefined;
  let preflightConnection: Redis | undefined = createBullRedisConnection();
  try {
    await withTimeout(
      withAbort(preflightConnection.connect(), signal),
      15_000,
      "Redis preflight timed out.",
    );
    await closeBullRedisConnection(preflightConnection);
    preflightConnection = undefined;
    signal?.throwIfAborted();
    initializeQueueRegistry();
    healthServer = config.JOB_RUNNER_HEALTH_PORT
      ? await startHealthServer(config.JOB_RUNNER_HEALTH_PORT, () => isReady)
      : undefined;
    const definitions = [
      {
        name: "resource-reconciliation",
        process: processStaleReservations,
      },
      { name: "worker-cleanup", process: processDisconnectedWorkers },
    ] as const;
    for (const definition of definitions) {
      const worker = new Worker<PhaseTwoJobData>(
        definition.name,
        (job) => definition.process(job),
        {
          connection: createBullRedisOptions(),
          prefix: jobQueuePrefix(),
          concurrency: 1,
        },
      );
      const resource = `worker:${definition.name}`;
      worker.on("error", (error) => {
        unhealthyResources.add(resource);
        isReady = false;
        logRuntimeError(resource, error);
      });
      worker.on("ready", () => {
        unhealthyResources.delete(resource);
        isReady = startupComplete && unhealthyResources.size === 0;
      });
      worker.on("failed", (job, error) => {
        console.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: "error",
            event: "jobs.queue_job_failed",
            queue: definition.name,
            jobId: job?.id,
            errorCode: classifyFailure(error.message),
          }),
        );
      });
      workers.push(worker);
    }

    await withTimeout(
      withAbort(
        Promise.all([
          ...workers.map((worker) => worker.waitUntilReady()),
          installSchedulers(config),
        ]),
        signal,
      ),
      15_000,
      "BullMQ runner startup timed out.",
    );
    startupComplete = true;
    isReady = unhealthyResources.size === 0;
  } catch (error) {
    isClosing = true;
    if (preflightConnection) {
      await closeBullRedisConnection(preflightConnection).catch(
        () => undefined,
      );
    }
    await closeRunnerResources(healthServer, workers).catch(() => undefined);
    throw error;
  }

  return {
    ready: () => isReady,
    close: async () => {
      if (isClosing) return;
      isClosing = true;
      isReady = false;
      await closeRunnerResources(healthServer, workers);
    },
  };
}

function withAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

async function closeRunnerResources(
  healthServer: Server | undefined,
  workers: Worker<PhaseTwoJobData>[],
): Promise<void> {
  const failures: unknown[] = [];
  if (healthServer) {
    await closeServer(healthServer).catch((error: unknown) =>
      failures.push(error),
    );
  }
  const closedWorkers = await Promise.allSettled(
    workers.map((worker) => worker.close()),
  );
  collectFailures(closedWorkers, failures);
  await closeQueueRegistry().catch((error: unknown) => failures.push(error));
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch((error: unknown) => failures.push(error));
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Job runner shutdown failed.");
  }
}

function collectFailures(
  results: PromiseSettledResult<unknown>[],
  failures: unknown[],
): void {
  failures.push(
    ...results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    ),
  );
}

async function withTimeout<T>(
  operation: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function installSchedulers(
  config: ReturnType<typeof getJobRunnerConfig>,
) {
  const requestedAt = new Date().toISOString();
  await Promise.all([
    upsertRegisteredJobScheduler(
      "reconcile-stale-reservations",
      "phase2-stale-reservations-v1",
      config.JOB_RUNNER_RECONCILIATION_INTERVAL_MS,
      {
        requestId: "scheduler-stale-reservations",
        correlationId: "scheduler-stale-reservations",
        requestedAt,
      },
    ),
    upsertRegisteredJobScheduler(
      "detect-disconnected-workers",
      "phase2-disconnected-workers-v1",
      config.JOB_RUNNER_WORKER_CHECK_INTERVAL_MS,
      {
        requestId: "scheduler-worker-cleanup",
        correlationId: "scheduler-worker-cleanup",
        requestedAt,
      },
    ),
  ]);
}

function startHealthServer(
  port: number,
  ready: () => boolean,
): Promise<Server> {
  const server = createServer((request, response) => {
    const live = request.url === "/live";
    const readiness = request.url === "/ready";
    if (!live && !readiness) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    const healthy = live || ready();
    response.writeHead(healthy ? 200 : 503, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify({ live: true, ready: ready() }));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function classifyFailure(reason: string): string {
  if (reason.includes("reservation")) return "RECONCILIATION_FAILED";
  return "JOB_FAILED";
}

function logRuntimeError(component: string, error: Error): void {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "jobs.runtime_error",
      component,
      errorCode: error.name,
    }),
  );
}

async function main(): Promise<void> {
  const controller = new AbortController();
  let runner: RunningJobRunner | undefined;
  let shutdownPromise: Promise<void> | undefined;
  const shutdown = async () => {
    controller.abort();
    if (!runner) return;
    shutdownPromise ??= runner.close();
    try {
      await shutdownPromise;
      process.exitCode = 0;
    } catch (error) {
      logRuntimeError(
        "shutdown",
        error instanceof Error ? error : new Error("Unknown shutdown failure"),
      );
      process.exitCode = 1;
    }
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
  process.once("SIGHUP", () => void shutdown());
  try {
    runner = await startJobRunner(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) return;
    throw error;
  }
  if (controller.signal.aborted) await shutdown();
}

const entrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (entrypoint === import.meta.url) {
  void main().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        event: "jobs.runner_start_failed",
        errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
        error: redactSecrets(error),
      }),
    );
    process.exitCode = 1;
  });
}
