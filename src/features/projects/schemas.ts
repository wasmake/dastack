import { z } from "zod";

import { organizationIdSchema } from "@/features/organizations/schemas";

export const projectIdSchema = organizationIdSchema;
export const projectIconSchema = z.enum([
  "box",
  "boxes",
  "database",
  "globe",
  "layers",
]);
export const projectSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    slug: projectSlugSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
    icon: projectIconSchema.default("box"),
  })
  .strict();

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    slug: projectSlugSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
    icon: projectIconSchema.optional(),
    version: z.number().int().min(0),
  })
  .strict()
  .refine(
    (input) =>
      input.name !== undefined ||
      input.slug !== undefined ||
      input.description !== undefined ||
      input.icon !== undefined,
    { message: "At least one project field must be updated." },
  );
