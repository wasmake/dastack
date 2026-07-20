import { z } from "zod";

import { organizationIdSchema } from "@/features/organizations/schemas";

export const reservationIdSchema = organizationIdSchema;
export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(160)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const reservableResourcesSchema = z
  .object({
    cpuMillicores: z.number().int().positive(),
    memoryMiB: z.number().int().positive(),
    storageGiB: z.number().finite().nonnegative(),
    transferGiB: z.number().finite().nonnegative(),
    backups: z.number().int().nonnegative(),
    concurrentOperations: z.number().int().positive(),
  })
  .strict();

export const reserveResourceSchema = z
  .object({
    projectId: organizationIdSchema,
    environmentId: organizationIdSchema,
    resources: reservableResourcesSchema,
    workerNodeId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/)
      .optional(),
  })
  .strict();

export const releaseResourceSchema = z
  .object({
    reason: z.enum(["requested", "failed"]).default("requested"),
  })
  .strict();
