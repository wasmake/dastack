import { z } from "zod";

const wizardValueSchema = z.union([
  z.string().max(64 * 1024),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const createServiceDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    templateId: z
      .string()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    manifestVersion: z.number().int().positive(),
    values: z.record(z.string(), wizardValueSchema),
  })
  .strict();

export const updateServiceDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    values: z.record(z.string(), wizardValueSchema).optional(),
    version: z.number().int().min(0),
  })
  .strict()
  .refine((input) => input.name !== undefined || input.values !== undefined, {
    message: "At least one draft field must be updated.",
  });
