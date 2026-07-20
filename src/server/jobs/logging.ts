export function logJobOutcome(input: {
  level: "info" | "error";
  event: string;
  queue: string;
  jobId: string;
  requestId: string;
  correlationId: string;
  outcome: "completed" | "failed";
  counts?: Record<string, number>;
  errorCode?: string;
}): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...input,
  });
  if (input.level === "error") console.error(line);
  else console.info(line);
}
