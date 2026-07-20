import { generateKeyPairSync, randomBytes } from "node:crypto";
import {
  availableParallelism,
  arch,
  cpus,
  freemem,
  hostname,
  loadavg,
  platform,
  totalmem,
  uptime,
} from "node:os";
import { statfs } from "node:fs/promises";

import { z } from "zod";

import {
  WORKER_KEY_ID_HEADER,
  WORKER_NONCE_HEADER,
  WORKER_SIGNATURE_HEADER,
  WORKER_TIMESTAMP_HEADER,
  signWorkerRequest,
} from "../../src/server/workers/protocol";
import { readAgentState, writeAgentState, type AgentState } from "./state";

const enrollmentResponseSchema = z
  .object({
    data: z
      .object({
        workerId: z.string().min(1).max(128),
        keyId: z.string().regex(/^[A-Za-z0-9_-]{12,80}$/),
        expiresAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
  })
  .passthrough();

export type EnrollmentOptions = {
  controlPlaneUrl: string;
  token: string;
  name: string;
  region: string;
  provider: string;
  capabilities: string[];
  concurrentOperations: number;
  statePath: string;
  allowHttp: boolean;
};

export async function enrollAgent(
  options: EnrollmentOptions,
): Promise<AgentState> {
  const baseUrl = validateControlPlaneUrl(
    options.controlPlaneUrl,
    options.allowHttp,
  );
  const expectedEnrollment = {
    name: options.name,
    region: options.region,
    provider: options.provider,
    capabilities: [...new Set(options.capabilities)].sort(),
    concurrentOperations: options.concurrentOperations,
  };
  let state: AgentState;
  try {
    state = await readAgentState(options.statePath);
    if (
      state.workerId ||
      state.controlPlaneUrl !== baseUrl.toString() ||
      JSON.stringify(state.enrollment) !== JSON.stringify(expectedEnrollment)
    ) {
      throw new Error(
        "Existing worker state does not match this enrollment request.",
      );
    }
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    state = {
      version: 2,
      phase: "phase-2-node-heartbeat",
      controlPlaneUrl: baseUrl.toString(),
      privateKey: privateKey
        .export({ format: "der", type: "pkcs8" })
        .toString("base64"),
      publicKey: publicKey
        .export({ format: "der", type: "spki" })
        .toString("base64"),
      enrollment: expectedEnrollment,
    };
    await writeAgentState(options.statePath, state);
  }

  const host = await readHostMetrics(options.concurrentOperations);
  const response = await fetch(new URL("/api/workers/enroll", baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      protocolVersion: 2,
      name: options.name,
      region: options.region,
      provider: {
        name: options.provider,
        capabilities: state.enrollment.capabilities,
      },
      totalCapacity: host.capacity,
      publicKey: {
        algorithm: "Ed25519",
        format: "spki-der",
        value: state.publicKey,
      },
      agent: agentMetadata(),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const responseBody: unknown = await response.json();
  if (!response.ok) {
    throw responseError("Worker enrollment", response.status, responseBody);
  }
  const enrollment = enrollmentResponseSchema.parse(responseBody).data;
  const enrolledState: AgentState = {
    ...state,
    workerId: enrollment.workerId,
    keyId: enrollment.keyId,
    credentialExpiresAt: enrollment.expiresAt,
  };
  await writeAgentState(options.statePath, enrolledState);
  return enrolledState;
}

export async function sendHeartbeat(
  statePath: string,
  allowHttp: boolean,
  signal?: AbortSignal,
): Promise<{ acceptedAt: string }> {
  const state = await readAgentState(statePath);
  if (!state.workerId || !state.keyId || !state.credentialExpiresAt) {
    throw new Error("The worker agent has not completed enrollment.");
  }
  if (Date.parse(state.credentialExpiresAt) <= Date.now()) {
    throw new Error("The worker credential has expired and must be rotated.");
  }
  const baseUrl = validateControlPlaneUrl(state.controlPlaneUrl, allowHttp);
  const endpoint = new URL("/api/workers/heartbeat", baseUrl);
  const host = await readHostMetrics(state.enrollment.concurrentOperations);
  const body = Buffer.from(
    JSON.stringify({
      protocolVersion: 2,
      observedAt: new Date().toISOString(),
      status: "ready",
      capacity: host.capacity,
      allocated: {
        cpuCores: 0,
        memoryBytes: 0,
        diskBytes: 0,
        concurrentOperations: 0,
      },
      hostUsage: host.usage,
      runtime: {
        phase: "phase-2-node-heartbeat",
        platform: platform(),
        architecture: arch(),
        nodeVersion: process.version,
        hostname: hostname().slice(0, 255),
        uptimeSeconds: uptime(),
        managedRuntime: "none",
      },
    }),
    "utf8",
  );
  const timestamp = String(Date.now());
  const nonce = randomBytes(24).toString("base64url");
  const signature = signWorkerRequest(
    {
      method: "POST",
      pathname: endpoint.pathname,
      timestamp,
      nonce,
      body,
    },
    state.privateKey,
  );
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      [WORKER_KEY_ID_HEADER]: state.keyId,
      [WORKER_TIMESTAMP_HEADER]: timestamp,
      [WORKER_NONCE_HEADER]: nonce,
      [WORKER_SIGNATURE_HEADER]: signature,
    },
    body,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const responseBody: unknown = await response.json().catch(() => null);
    throw responseError("Worker heartbeat", response.status, responseBody);
  }
  const responseBody = (await response.json()) as {
    data?: { acceptedAt?: string };
  };
  return {
    acceptedAt: responseBody.data?.acceptedAt ?? new Date().toISOString(),
  };
}

export async function runHeartbeatLoop(input: {
  statePath: string;
  allowHttp: boolean;
  intervalSeconds: number;
  signal: AbortSignal;
}): Promise<void> {
  if (
    !Number.isInteger(input.intervalSeconds) ||
    input.intervalSeconds < 5 ||
    input.intervalSeconds > 300
  ) {
    throw new Error("Heartbeat interval must be between 5 and 300 seconds.");
  }
  let transientFailures = 0;
  while (!input.signal.aborted) {
    try {
      await sendHeartbeat(input.statePath, input.allowHttp, input.signal);
      transientFailures = 0;
      await sleep(input.intervalSeconds * 1_000, input.signal);
    } catch (error) {
      if (input.signal.aborted) return;
      if (!isTransientHeartbeatError(error)) throw error;
      transientFailures += 1;
      const retryInMs = Math.min(
        30_000,
        1_000 * 2 ** Math.min(transientFailures - 1, 5),
      );
      console.error(
        JSON.stringify({
          event: "worker.heartbeat_retry",
          phase: "phase-2-node-heartbeat",
          errorCode: error instanceof Error ? error.name : "NETWORK_ERROR",
          retryInMs,
        }),
      );
      await sleep(retryInMs, input.signal);
    }
  }
}

function isTransientHeartbeatError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== "object") return false;
  if (
    "name" in error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return true;
  }
  if ("httpStatus" in error && typeof error.httpStatus === "number") {
    return (
      error.httpStatus === 408 ||
      error.httpStatus === 429 ||
      error.httpStatus >= 500
    );
  }
  return false;
}

function validateControlPlaneUrl(value: string, allowHttp: boolean): URL {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "The control-plane URL cannot contain credentials or query data.",
    );
  }
  if (url.protocol === "https:") return url;
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol === "http:" && allowHttp && localHost) return url;
  throw new Error(
    "TLS is required; local loopback HTTP requires the explicit --allow-http flag.",
  );
}

async function readHostMetrics(concurrentOperations: number): Promise<{
  capacity: {
    cpuCores: number;
    memoryBytes: number;
    diskBytes: number;
    concurrentOperations: number;
  };
  usage: {
    loadAverage1m: number;
    memoryUsedBytes: number;
    diskUsedBytes: number;
  };
}> {
  const filesystem = await statfs("/", { bigint: true });
  const diskBytes = safeNumber(filesystem.bsize * filesystem.blocks);
  const diskFreeBytes = safeNumber(filesystem.bsize * filesystem.bavail);
  const memoryBytes = totalmem();
  return {
    capacity: {
      cpuCores: availableParallelism?.() ?? cpus().length,
      memoryBytes,
      diskBytes,
      concurrentOperations,
    },
    usage: {
      loadAverage1m: loadavg()[0] ?? 0,
      memoryUsedBytes: Math.max(0, memoryBytes - freemem()),
      diskUsedBytes: Math.max(0, diskBytes - diskFreeBytes),
    },
  };
}

function agentMetadata() {
  return {
    name: "dastack-worker-agent" as const,
    version: "0.2.0",
    phase: "phase-2-node-heartbeat" as const,
    platform: platform(),
    architecture: arch(),
    nodeVersion: process.version,
  };
}

function safeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Host capacity exceeds the protocol's safe integer range.");
  }
  return Number(value);
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const abort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
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

function responseError(
  operation: string,
  status: number,
  body: unknown,
): Error {
  const code =
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "code" in body.error &&
    typeof body.error.code === "string" &&
    /^[A-Z][A-Z0-9_]{1,63}$/.test(body.error.code)
      ? body.error.code
      : "WORKER_REQUEST_FAILED";
  const error = new Error(`${operation} failed with HTTP ${status}.`);
  error.name = code;
  Object.assign(error, { httpStatus: status });
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "fields" in body.error &&
    Array.isArray(body.error.fields)
  ) {
    const paths = body.error.fields
      .flatMap((field) =>
        field &&
        typeof field === "object" &&
        "path" in field &&
        typeof field.path === "string"
          ? [field.path]
          : [],
      )
      .filter((path) => /^[A-Za-z0-9_.\[\]-]{1,160}$/.test(path))
      .slice(0, 10);
    Object.assign(error, { validationPaths: paths });
  }
  return error;
}
