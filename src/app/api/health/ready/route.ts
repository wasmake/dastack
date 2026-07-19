import { pingMongo } from "@/server/db/mongodb";
import { getServerEnv, validateServerEnv } from "@/server/env";
import { pingRedis } from "@/server/redis";
import { nanoid } from "nanoid";

async function readiness() {
  const envStatus = validateServerEnv();
  if (!envStatus.ok)
    return {
      ready: false,
      checks: {
        environment: "failed",
        mongodb: "unknown",
        rateLimiter: "unknown",
      },
    };
  const env = getServerEnv();
  const [mongoResult, redisResult] = await Promise.allSettled([
    pingMongo(),
    env.NODE_ENV === "development" ? Promise.resolve() : pingRedis(),
  ]);
  return {
    ready:
      mongoResult.status === "fulfilled" && redisResult.status === "fulfilled",
    checks: {
      environment: "ok",
      mongodb: mongoResult.status === "fulfilled" ? "ok" : "failed",
      rateLimiter:
        redisResult.status === "fulfilled"
          ? env.NODE_ENV === "development"
            ? "memory"
            : "ok"
          : "failed",
      email: env.NODE_ENV === "development" ? "file" : "configured",
    },
  };
}

export async function GET() {
  const requestId = nanoid(20);
  const result = await readiness();
  return Response.json(
    { data: result, requestId },
    {
      status: result.ready ? 200 : 503,
      headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" },
    },
  );
}

export { readiness };
