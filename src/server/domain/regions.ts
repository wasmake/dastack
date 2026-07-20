import { z } from "zod";

export const regionSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/);
