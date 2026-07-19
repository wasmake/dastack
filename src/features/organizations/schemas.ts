import { z } from "zod";

import { normalizeEmail } from "@/features/auth/schemas";

export const organizationIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export const createOrganizationSchema = z
  .object({ name: z.string().trim().min(2).max(100) })
  .strict();

export const invitationSchema = z
  .object({
    email: z.string().trim().max(320).email().transform(normalizeEmail),
    roleId: organizationIdSchema,
  })
  .strict();

export const updateMemberSchema = z
  .object({ roleId: organizationIdSchema, version: z.number().int().min(0) })
  .strict();

export const acceptInvitationSchema = z
  .object({ token: z.string().min(32).max(512) })
  .strict();

export const transferOwnershipSchema = z
  .object({ targetMemberId: organizationIdSchema })
  .strict();
