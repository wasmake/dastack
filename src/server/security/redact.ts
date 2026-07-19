const sensitiveKey =
  /authorization|cookie|password|secret|token|credential|api[-_]?key/i;

function redactString(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(
      /([?&](?:token|password|secret|api[_-]?key)=)[^&\s]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /((?:token|password|secret|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
}

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[REDACTED]";
  if (value instanceof Error)
    return { name: value.name, message: redactString(value.message) };
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => redactSecrets(item, depth + 1));
  if (typeof value === "string") return redactString(value);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sensitiveKey.test(key) ? "[REDACTED]" : redactSecrets(item, depth + 1),
    ]),
  );
}

export function secureLogError(
  event: string,
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  console.error(
    JSON.stringify({
      level: "error",
      event,
      error: redactSecrets(error),
      context: redactSecrets(context),
    }),
  );
}
