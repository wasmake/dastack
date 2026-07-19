import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorPayload(
  error: unknown,
  requestId: string,
): { status: number; body: Record<string, unknown>; headers?: HeadersInit } {
  if (error instanceof AppError) {
    const headers =
      error.status === 429 && typeof error.details === "number"
        ? {
            "Retry-After": String(
              Math.max(1, Math.ceil(error.details / 1_000)),
            ),
          }
        : undefined;
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message }, requestId },
      headers,
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "The request was invalid.",
          fields: error.issues.map((issue) => ({
            path: issue.path.join("."),
            code: issue.code,
          })),
        },
        requestId,
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
      },
      requestId,
    },
  };
}
