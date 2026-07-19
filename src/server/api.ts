import { NextResponse } from "next/server";

import { errorPayload } from "@/server/security/errors";
import { AppError } from "@/server/security/errors";
import { secureLogError } from "@/server/security/redact";
import {
  getRequestContext,
  type RequestContext,
} from "@/server/security/request";

type ApiResult = { data: unknown; status?: number; headers?: HeadersInit };

export async function readJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 64 * 1_024)
    throw new AppError(
      413,
      "PAYLOAD_TOO_LARGE",
      "The request body is too large.",
    );
  try {
    return await request.json();
  } catch {
    throw new AppError(
      400,
      "INVALID_JSON",
      "The request body must be valid JSON.",
    );
  }
}

export async function handleApi(
  request: Request,
  handler: (context: RequestContext) => Promise<ApiResult>,
): Promise<NextResponse> {
  let context: RequestContext;
  try {
    context = getRequestContext(request);
  } catch (error) {
    const requestId = request.headers.get("x-request-id") ?? "unavailable";
    const response = errorPayload(error, requestId);
    return NextResponse.json(response.body, {
      status: response.status,
      headers: response.headers,
    });
  }

  try {
    const result = await handler(context);
    const headers = new Headers(result.headers);
    headers.set("X-Request-Id", context.requestId);
    headers.set("Cache-Control", "no-store");
    return NextResponse.json(
      { data: result.data, requestId: context.requestId },
      { status: result.status ?? 200, headers },
    );
  } catch (error) {
    const response = errorPayload(error, context.requestId);
    if (response.status >= 500)
      secureLogError("api.request_failed", error, {
        requestId: context.requestId,
      });
    const headers = new Headers(response.headers);
    headers.set("X-Request-Id", context.requestId);
    headers.set("Cache-Control", "no-store");
    return NextResponse.json(response.body, {
      status: response.status,
      headers,
    });
  }
}
