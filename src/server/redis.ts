import Redis from "ioredis";

import { getServerEnv } from "@/server/env";

declare global {
  var __dastackRedis: Redis | undefined;
  var __dastackRedisReady: Promise<void> | undefined;
}

export function getRedis(): Redis {
  const env = getServerEnv();
  if (!env.REDIS_URL) throw new Error("Redis is not configured");

  if (!global.__dastackRedis) {
    global.__dastackRedis = new Redis(env.REDIS_URL, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
    });
  }

  return global.__dastackRedis;
}

export async function pingRedis(): Promise<void> {
  await ensureRedis();
  const redis = getRedis();
  await redis.ping();
}

export function ensureRedis(): Promise<void> {
  const redis = getRedis();
  if (redis.status === "ready") return Promise.resolve();
  if (!global.__dastackRedisReady) {
    global.__dastackRedisReady = (
      redis.status === "wait"
        ? redis.connect()
        : new Promise<void>((resolve, reject) => {
            redis.once("ready", resolve);
            redis.once("error", reject);
          })
    )
      .then(() => {
        global.__dastackRedisReady = undefined;
      })
      .catch((error) => {
        global.__dastackRedisReady = undefined;
        throw error;
      });
  }
  return global.__dastackRedisReady;
}
