import { createHash } from "node:crypto";

import type { QueueName, RegisteredJobName } from "@/server/jobs/definitions";

const idempotencyPattern = /^[A-Za-z0-9._:-]{8,160}$/;

export function deterministicJobId(
  queue: QueueName,
  name: RegisteredJobName,
  idempotencyKey: string,
): string {
  if (!idempotencyPattern.test(idempotencyKey)) {
    throw new Error("The job idempotency key is invalid.");
  }
  const digest = createHash("sha256")
    .update(`${queue}\n${name}\n${idempotencyKey}`, "utf8")
    .digest("hex");
  return `${queue}-${name}-${digest.slice(0, 32)}`;
}
