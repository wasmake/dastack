import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_URL: z.string().url(),
    MONGODB_URI: z
      .string()
      .refine(
        (value) =>
          value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"),
        "MONGODB_URI must be a MongoDB connection string",
      ),
    MONGODB_DB: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default("dastack"),
    AUTH_SECRET: z.string().min(32),
    AUTH_GITHUB_ID: optionalString,
    AUTH_GITHUB_SECRET: optionalString,
    AUTH_GOOGLE_ID: optionalString,
    AUTH_GOOGLE_SECRET: optionalString,
    RESEND_API_KEY: optionalString,
    EMAIL_ADAPTER: z.enum(["resend", "file"]).default("resend"),
    EMAIL_FROM: z
      .string()
      .trim()
      .refine(
        (value) =>
          /^(?:[^<>]+\s)?<?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(value),
        "EMAIL_FROM must contain a valid email address",
      ),
    EMAIL_REPLY_TO: optionalString,
    REDIS_URL: optionalString,
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    EMAIL_DEV_DIR: z.string().trim().min(1).default("/tmp/dastack-emails"),
  })
  .superRefine((env, context) => {
    const pairs = [
      [
        "AUTH_GITHUB_ID",
        env.AUTH_GITHUB_ID,
        "AUTH_GITHUB_SECRET",
        env.AUTH_GITHUB_SECRET,
      ],
      [
        "AUTH_GOOGLE_ID",
        env.AUTH_GOOGLE_ID,
        "AUTH_GOOGLE_SECRET",
        env.AUTH_GOOGLE_SECRET,
      ],
    ] as const;

    for (const [leftName, left, rightName, right] of pairs) {
      if (Boolean(left) !== Boolean(right)) {
        context.addIssue({
          code: "custom",
          path: [left ? rightName : leftName],
          message: `${leftName} and ${rightName} must be configured together`,
        });
      }
    }

    if (env.NODE_ENV === "production") {
      for (const [name, value] of [
        ["AUTH_GITHUB_ID", env.AUTH_GITHUB_ID],
        ["AUTH_GITHUB_SECRET", env.AUTH_GITHUB_SECRET],
        ["AUTH_GOOGLE_ID", env.AUTH_GOOGLE_ID],
        ["AUTH_GOOGLE_SECRET", env.AUTH_GOOGLE_SECRET],
        ["RESEND_API_KEY", env.RESEND_API_KEY],
        ["REDIS_URL", env.REDIS_URL],
      ] as const) {
        if (!value) {
          context.addIssue({
            code: "custom",
            path: [name],
            message: `${name} is required in production`,
          });
        }
      }

      if (!env.APP_URL.startsWith("https://")) {
        context.addIssue({
          code: "custom",
          path: ["APP_URL"],
          message: "APP_URL must use HTTPS in production",
        });
      }
      if (env.EMAIL_ADAPTER !== "resend") {
        context.addIssue({
          code: "custom",
          path: ["EMAIL_ADAPTER"],
          message: "Production email must use Resend",
        });
      }
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

/** Runtime-only validation keeps route collection and static builds free of env side effects. */
export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;

  cachedEnv = serverEnvSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    APP_URL: process.env.APP_URL ?? process.env.AUTH_URL,
    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_DB: process.env.MONGODB_DB,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_ADAPTER: process.env.EMAIL_ADAPTER,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
    REDIS_URL: process.env.REDIS_URL,
    TRUST_PROXY: process.env.TRUST_PROXY,
    EMAIL_DEV_DIR: process.env.EMAIL_DEV_DIR,
  });

  return cachedEnv;
}

export function validateServerEnv():
  { ok: true } | { ok: false; issues: string[] } {
  try {
    getServerEnv();
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        issues: error.issues.map((issue) => issue.path.join(".")),
      };
    }
    return { ok: false, issues: ["environment"] };
  }
}
