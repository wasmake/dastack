import mongoose, { type ClientSession } from "mongoose";

import { connectMongoose } from "@/server/db/mongodb";

const MAX_TRANSACTION_ATTEMPTS = 3;

function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    hasErrorLabel?: (label: string) => boolean;
  };
  // The driver retries an unknown commit result without replaying the callback.
  // Only a surfaced transient transaction error is safe to rerun end-to-end.
  return Boolean(candidate.hasErrorLabel?.("TransientTransactionError"));
}

export async function runTransaction<T>(
  operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
  await connectMongoose();
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await mongoose.connection.transaction(operation, {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      });
    } catch (error) {
      lastError = error;
      if (
        attempt === MAX_TRANSACTION_ATTEMPTS ||
        !isRetryableTransactionError(error)
      ) {
        throw error;
      }
    }
  }

  throw lastError;
}
