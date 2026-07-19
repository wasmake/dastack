import {
  RateLimiterMemory,
  RateLimiterRedis,
  type RateLimiterAbstract,
  type RateLimiterRes,
} from "rate-limiter-flexible";

import { getServerEnv } from "@/server/env";
import { ensureRedis, getRedis } from "@/server/redis";
import { AppError } from "@/server/security/errors";

export type RateLimitPolicy = {
  name: string;
  points: number;
  duration: number;
  blockDuration?: number;
};

const limiters = new Map<string, RateLimiterAbstract>();

function getLimiter(policy: RateLimitPolicy): RateLimiterAbstract {
  const key = `${policy.name}:${policy.points}:${policy.duration}:${policy.blockDuration ?? 0}`;
  const existing = limiters.get(key);
  if (existing) return existing;

  const env = getServerEnv();
  const options = {
    keyPrefix: `dastack:${policy.name}`,
    points: policy.points,
    duration: policy.duration,
    blockDuration: policy.blockDuration ?? policy.duration,
  };
  const limiter =
    env.NODE_ENV === "development"
      ? new RateLimiterMemory(options)
      : new RateLimiterRedis({
          ...options,
          storeClient: getRedis(),
          rejectIfRedisNotReady: true,
          inMemoryBlockOnConsumed: policy.points + 1,
          inMemoryBlockDuration: policy.blockDuration ?? policy.duration,
        });
  limiters.set(key, limiter);
  return limiter;
}

export async function enforceRateLimit(
  policy: RateLimitPolicy,
  key: string,
  points = 1,
): Promise<void> {
  try {
    if (getServerEnv().NODE_ENV !== "development") await ensureRedis();
    await getLimiter(policy).consume(key, points);
  } catch (error) {
    if (error instanceof Error) {
      throw new AppError(
        503,
        "SECURITY_SERVICE_UNAVAILABLE",
        "The request cannot be processed right now.",
      );
    }
    const result = error as RateLimiterRes;
    throw new AppError(
      429,
      "RATE_LIMITED",
      "Too many requests. Try again later.",
      result.msBeforeNext ?? 1_000,
    );
  }
}

export async function clearRateLimit(
  policy: RateLimitPolicy,
  key: string,
): Promise<void> {
  try {
    await getLimiter(policy).delete(key);
  } catch {
    // A successful authentication must not fail because cleanup of its throttle key failed.
  }
}
