import { z } from "zod";

import { organizationIdSchema } from "@/features/organizations/schemas";
import { projectSlugSchema } from "@/features/projects/schemas";
import { regionSchema } from "@/server/domain/regions";

export const environmentIdSchema = organizationIdSchema;
export const environmentSlugSchema = projectSlugSchema;
export const environmentTypeSchema = z.enum([
  "production",
  "preview",
  "development",
  "custom",
]);
export { regionSchema };

export const createEnvironmentSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    slug: environmentSlugSchema.optional(),
    type: environmentTypeSchema,
    isDefault: z.boolean().optional().default(false),
    region: regionSchema,
  })
  .strict();

export const updateEnvironmentSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    slug: environmentSlugSchema.optional(),
    type: environmentTypeSchema.optional(),
    isDefault: z.boolean().optional(),
    region: regionSchema.optional(),
    version: z.number().int().min(0),
  })
  .strict()
  .refine(
    (input) =>
      input.name !== undefined ||
      input.slug !== undefined ||
      input.type !== undefined ||
      input.isDefault !== undefined ||
      input.region !== undefined,
    { message: "At least one environment field must be updated." },
  );
