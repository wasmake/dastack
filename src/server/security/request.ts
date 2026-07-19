import { createHmac } from "node:crypto";

import { nanoid } from "nanoid";

import { getServerEnv } from "@/server/env";

const requestIdPattern = /^[A-Za-z0-9._-]{8,80}$/;
const requestContexts = new WeakMap<Request, RequestContext>();

export type RequestContext = {
  requestId: string;
  ipHash: string | null;
  userAgent: string | null;
};

export function getRequestContext(request: Request): RequestContext {
  const existing = requestContexts.get(request);
  if (existing) return existing;
  const env = getServerEnv();
  const suppliedId = request.headers.get("x-request-id");
  const requestId =
    suppliedId && requestIdPattern.test(suppliedId) ? suppliedId : nanoid(20);
  const forwarded = env.TRUST_PROXY
    ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    : undefined;
  const ip = forwarded || "unknown";
  const ipHash = createHmac("sha256", env.AUTH_SECRET).update(ip).digest("hex");
  const rawAgent = request.headers
    .get("user-agent")
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  const context = {
    requestId,
    ipHash,
    userAgent: rawAgent ? rawAgent.slice(0, 512) : null,
  };
  requestContexts.set(request, context);
  return context;
}

export function digestIdentifier(identifier: string): string {
  return createHmac("sha256", getServerEnv().AUTH_SECRET)
    .update(identifier)
    .digest("hex");
}
