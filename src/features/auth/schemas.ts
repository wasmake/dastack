import { z } from "zod";

export const normalizeEmail = (email: string) =>
  email.trim().normalize("NFKC").toLowerCase();

const emailSchema = z
  .string()
  .trim()
  .max(320)
  .email()
  .transform(normalizeEmail);
const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine(
    (password) => /[a-z]/.test(password),
    "Password must contain a lowercase letter",
  )
  .refine(
    (password) => /[A-Z]/.test(password),
    "Password must contain an uppercase letter",
  )
  .refine((password) => /\d/.test(password), "Password must contain a number")
  .refine(
    (password) => /[^A-Za-z0-9]/.test(password),
    "Password must contain a symbol",
  );

export const registrationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: passwordSchema,
    passwordConfirmation: z.string(),
    termsAccepted: z.literal(true),
  })
  .strict()
  .refine((input) => input.password === input.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Passwords do not match",
  });

export const emailRequestSchema = z.object({ email: emailSchema }).strict();

export const passwordResetSchema = z
  .object({
    token: z.string().min(32).max(512),
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .strict()
  .refine((input) => input.password === input.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Passwords do not match",
  });

export const credentialsSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
    remember: z.enum(["true", "false"]).default("false"),
  })
  .strict();

export type RegistrationInput = z.infer<typeof registrationSchema>;
