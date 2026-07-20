import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");
const positiveInteger = (fallback: number, maximum: number) =>
  z.coerce.number().int().positive().max(maximum).default(fallback);
const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);

const workerSecuritySchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    WORKER_ALLOW_INSECURE_HTTP: booleanString,
    WORKER_REQUEST_MAX_SKEW_SECONDS: positiveInteger(60, 300),
    WORKER_NONCE_TTL_SECONDS: positiveInteger(300, 3_600),
    WORKER_CREDENTIAL_TTL_SECONDS: positiveInteger(86_400, 604_800),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && value.WORKER_ALLOW_INSECURE_HTTP) {
      context.addIssue({
        code: "custom",
        path: ["WORKER_ALLOW_INSECURE_HTTP"],
        message: "Worker HTTP transport cannot be enabled in production.",
      });
    }
    if (
      value.WORKER_NONCE_TTL_SECONDS <
      value.WORKER_REQUEST_MAX_SKEW_SECONDS * 2
    ) {
      context.addIssue({
        code: "custom",
        path: ["WORKER_NONCE_TTL_SECONDS"],
        message: "Nonce TTL must cover both sides of the accepted clock skew.",
      });
    }
  });

const enrollmentSchema = z.object({
  WORKER_ENROLLMENT_TOKEN_DIGEST: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .transform((value) => value.toLowerCase()),
  WORKER_SYSTEM_ACTOR_ID: objectId,
  WORKER_SYSTEM_ORGANIZATION_ID: objectId,
});

const workerPersistenceSchema = z.object({
  WORKER_SYSTEM_ACTOR_ID: objectId,
  WORKER_SYSTEM_ORGANIZATION_ID: objectId,
});

const commandSigningSchema = z.object({
  WORKER_CONTROL_SIGNING_KEY_ID: z.string().regex(/^[A-Za-z0-9_-]{12,80}$/),
  WORKER_CONTROL_SIGNING_PRIVATE_KEY: z.string().min(40).max(256),
});

const reconciliationSchema = z.object({
  WORKER_DISCONNECT_AFTER_SECONDS: positiveInteger(90, 3_600),
  WORKER_RECONCILIATION_BATCH_SIZE: positiveInteger(100, 1_000),
});

const runnerSchema = z.object({
  JOB_RUNNER_HEALTH_PORT: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(1_024).max(65_535).optional(),
  ),
  JOB_RUNNER_RECONCILIATION_INTERVAL_MS: positiveInteger(60_000, 3_600_000),
  JOB_RUNNER_WORKER_CHECK_INTERVAL_MS: positiveInteger(30_000, 3_600_000),
});

export type WorkerSecurityConfig = z.infer<typeof workerSecuritySchema>;

export function getWorkerSecurityConfig(): WorkerSecurityConfig {
  return workerSecuritySchema.parse(process.env);
}

export function getWorkerEnrollmentConfig(): z.infer<typeof enrollmentSchema> {
  return enrollmentSchema.parse(process.env);
}

export function getWorkerPersistenceConfig(): z.infer<
  typeof workerPersistenceSchema
> {
  return workerPersistenceSchema.parse(process.env);
}

export function getControlCommandSigningConfig(): z.infer<
  typeof commandSigningSchema
> {
  return commandSigningSchema.parse(process.env);
}

export function getWorkerReconciliationConfig(): z.infer<
  typeof reconciliationSchema
> {
  return reconciliationSchema.parse(process.env);
}

export function getJobRunnerConfig(): z.infer<typeof runnerSchema> {
  return runnerSchema.parse(process.env);
}
