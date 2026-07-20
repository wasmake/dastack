import { z } from "zod";

import { regionSchema } from "@/server/domain/regions";
import { WORKER_PROTOCOL_VERSION } from "@/server/workers/protocol";

const bytes = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const cores = z.number().finite().nonnegative().max(16_384);
const capacitySchema = z
  .object({
    cpuCores: cores,
    memoryBytes: bytes,
    diskBytes: bytes,
    concurrentOperations: z.number().int().nonnegative().max(1_000),
  })
  .strict();
const totalCapacitySchema = capacitySchema.refine(
  (value) =>
    value.cpuCores > 0 &&
    value.memoryBytes > 0 &&
    value.diskBytes > 0 &&
    value.concurrentOperations > 0,
  "Reported total capacity must be positive.",
);
const capabilitySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

export const workerPublicKeySchema = z
  .object({
    algorithm: z.literal("Ed25519"),
    format: z.literal("spki-der"),
    value: z
      .string()
      .min(56)
      .max(128)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

export const workerEnrollmentSchema = z
  .object({
    protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
    name: z.string().trim().min(1).max(100),
    region: regionSchema,
    provider: z
      .object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
        capabilities: z.array(capabilitySchema).max(32),
      })
      .strict(),
    totalCapacity: totalCapacitySchema,
    publicKey: workerPublicKeySchema,
    agent: z
      .object({
        name: z.literal("dastack-worker-agent"),
        version: z.string().trim().min(1).max(32),
        phase: z.literal("phase-2-node-heartbeat"),
        platform: z.string().trim().min(1).max(32),
        architecture: z.string().trim().min(1).max(32),
        nodeVersion: z.string().trim().min(1).max(32),
      })
      .strict(),
  })
  .strict();

export const workerHeartbeatSchema = z
  .object({
    protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
    observedAt: z.iso.datetime({ offset: true }),
    status: z.enum(["ready", "degraded", "draining"]),
    capacity: totalCapacitySchema,
    allocated: capacitySchema,
    hostUsage: z
      .object({
        loadAverage1m: z.number().finite().nonnegative().max(1_000_000),
        memoryUsedBytes: bytes,
        diskUsedBytes: bytes,
      })
      .strict(),
    runtime: z
      .object({
        phase: z.literal("phase-2-node-heartbeat"),
        platform: z.string().trim().min(1).max(32),
        architecture: z.string().trim().min(1).max(32),
        nodeVersion: z.string().trim().min(1).max(32),
        hostname: z.string().trim().min(1).max(255),
        uptimeSeconds: z
          .number()
          .finite()
          .nonnegative()
          .max(10 ** 10),
        managedRuntime: z.literal("none"),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const field of ["cpuCores", "memoryBytes", "diskBytes"] as const) {
      if (value.allocated[field] > value.capacity[field]) {
        context.addIssue({
          code: "custom",
          path: ["allocated", field],
          message: "Allocated capacity cannot exceed total capacity.",
        });
      }
    }
    if (value.hostUsage.memoryUsedBytes > value.capacity.memoryBytes) {
      context.addIssue({
        code: "custom",
        path: ["hostUsage", "memoryUsedBytes"],
        message: "Used memory cannot exceed total memory.",
      });
    }
    if (value.hostUsage.diskUsedBytes > value.capacity.diskBytes) {
      context.addIssue({
        code: "custom",
        path: ["hostUsage", "diskUsedBytes"],
        message: "Used disk cannot exceed total disk.",
      });
    }
  });

export const workerResultSchema = z
  .object({
    protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
    commandId: z.string().regex(/^[A-Za-z0-9_-]{12,80}$/),
    completedAt: z.iso.datetime({ offset: true }),
    outcome: z.enum(["succeeded", "failed"]),
    resultDigest: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
    errorCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{1,63}$/)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.outcome === "failed" && !value.errorCode) {
      context.addIssue({
        code: "custom",
        path: ["errorCode"],
        message: "Failed results require a bounded error code.",
      });
    }
  });

export const workerCredentialRotationSchema = z
  .object({
    protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
    publicKey: workerPublicKeySchema,
    challengeId: z.string().regex(/^[A-Za-z0-9_-]{12,80}$/),
    challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    proof: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
  })
  .strict();

export const workerCredentialRotationChallengeSchema = z
  .object({ protocolVersion: z.literal(WORKER_PROTOCOL_VERSION) })
  .strict();

export type WorkerEnrollment = z.infer<typeof workerEnrollmentSchema>;
export type WorkerHeartbeat = z.infer<typeof workerHeartbeatSchema>;
export type WorkerResult = z.infer<typeof workerResultSchema>;
export type WorkerCredentialRotation = z.infer<
  typeof workerCredentialRotationSchema
>;
export type WorkerCredentialRotationChallenge = z.infer<
  typeof workerCredentialRotationChallengeSchema
>;
