import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";

import Redis from "ioredis";
import { afterEach, describe, expect, it } from "vitest";

const queuePrefixes: string[] = [];

function isolatedEnvironment(prefix: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    JOB_QUEUE_PREFIX: prefix,
    JOB_RUNNER_HEALTH_PORT: "",
    JOB_RUNNER_RECONCILIATION_INTERVAL_MS: "3600000",
    JOB_RUNNER_WORKER_CHECK_INTERVAL_MS: "3600000",
  };
}

afterEach(async () => {
  const prefixes = queuePrefixes.splice(0);
  if (prefixes.length === 0) return;
  const redis = new Redis(
    process.env.REDIS_URL ?? "redis://:change-me-local-redis@127.0.0.1:6379/0",
    { maxRetriesPerRequest: 1 },
  );
  try {
    for (const prefix of prefixes) {
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(
          cursor,
          "MATCH",
          `${prefix}:*`,
          "COUNT",
          100,
        );
        cursor = next;
        if (keys.length > 0) await redis.unlink(...keys);
      } while (cursor !== "0");
    }
  } finally {
    await redis.quit();
  }
});

function waitForExit(
  child: ChildProcess,
  timeoutMilliseconds = 10_000,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Job runner subprocess did not exit."));
    }, timeoutMilliseconds);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

function nodeProcess(arguments_: string[], environment = process.env) {
  return spawn(process.execPath, arguments_, {
    cwd: process.cwd(),
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("job runner lifecycle", () => {
  it("starts ready and releases all owned handles on close", async () => {
    const prefix = `dastack-lifecycle-${randomBytes(8).toString("hex")}`;
    queuePrefixes.push(prefix);
    const child = nodeProcess(
      [
        "--env-file-if-exists=.env",
        "--import",
        "tsx",
        "-e",
        '(async()=>{const {startJobRunner}=await import("./src/server/jobs/runner.ts");const runner=await startJobRunner();if(!runner.ready())throw new Error("not ready");await runner.close()})().catch(error=>{console.error(error);process.exitCode=1})',
      ],
      isolatedEnvironment(prefix),
    );

    await expect(waitForExit(child)).resolves.toEqual({
      code: 0,
      signal: null,
    });
  });

  it("cancels startup promptly when Redis is unavailable", async () => {
    const prefix = `dastack-lifecycle-${randomBytes(8).toString("hex")}`;
    queuePrefixes.push(prefix);
    const child = nodeProcess(
      [
        "--env-file-if-exists=.env",
        "--import",
        "tsx",
        "src/server/jobs/runner.ts",
      ],
      {
        ...isolatedEnvironment(prefix),
        REDIS_URL: "redis://127.0.0.1:1/0",
      },
    );
    const termination = setTimeout(() => child.kill("SIGTERM"), 1_500);
    const result = await waitForExit(child);
    clearTimeout(termination);

    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
  });
});
