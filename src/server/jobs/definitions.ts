import { z } from "zod";

export const QUEUE_NAMES = [
  "provisioning",
  "deployments",
  "email",
  "backup",
  "restore",
  "metrics",
  "usage",
  "billing",
  "resource-reconciliation",
  "dns",
  "certificate",
  "ingress",
  "worker-cleanup",
  "suspension",
  "deprovisioning",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export const phaseTwoJobDataSchema = z
  .object({
    requestId: z.string().regex(/^[A-Za-z0-9._-]{8,80}$/),
    correlationId: z.string().regex(/^[A-Za-z0-9._-]{8,80}$/),
    requestedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type PhaseTwoJobData = z.infer<typeof phaseTwoJobDataSchema>;

export const REGISTERED_JOB_DEFINITIONS = {
  "reconcile-stale-reservations": {
    queue: "resource-reconciliation",
  },
  "detect-disconnected-workers": {
    queue: "worker-cleanup",
  },
} as const satisfies Record<string, { queue: QueueName }>;

export type RegisteredJobName = keyof typeof REGISTERED_JOB_DEFINITIONS;

export function registeredQueueFor(name: string): QueueName {
  if (!(name in REGISTERED_JOB_DEFINITIONS)) {
    throw new Error(`No typed job definition is registered for ${name}.`);
  }
  return REGISTERED_JOB_DEFINITIONS[name as RegisteredJobName].queue;
}
