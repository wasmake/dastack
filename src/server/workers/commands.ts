import { getControlCommandSigningConfig } from "@/server/workers/env";
import {
  signControlCommand,
  type ControlCommandEnvelope,
} from "@/server/workers/protocol";

export function signConfiguredControlCommand(input: {
  commandId: string;
  workerId: string;
  payload: Uint8Array;
  expiresAt: Date;
  issuedAt?: Date;
}): ControlCommandEnvelope {
  const config = getControlCommandSigningConfig();
  return signControlCommand({
    keyId: config.WORKER_CONTROL_SIGNING_KEY_ID,
    commandId: input.commandId,
    workerId: input.workerId,
    issuedAt: input.issuedAt ?? new Date(),
    expiresAt: input.expiresAt,
    payload: input.payload,
    privateKey: config.WORKER_CONTROL_SIGNING_PRIVATE_KEY,
  });
}
