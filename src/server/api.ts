import { NextResponse } from "next/server";

import { AppError, errorPayload } from "@/server/security/errors";
import { secureLogError } from "@/server/security/redact";
import {
  getRequestContext,
  type RequestContext,
} from "@/server/security/request";

type ApiResult = { data: unknown; status?: number; headers?: HeadersInit };
const MAX_JSON_BODY_BYTES = 64 * 1_024;

export async function readBody(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array> {
  const rawLength = request.headers.get("content-length");
  const declaredLength = rawLength === null ? 0 : Number(rawLength);
  if (
    !Number.isSafeInteger(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > maximumBytes
  ) {
    throw new AppError(
      413,
      "PAYLOAD_TOO_LARGE",
      "The request body is too large.",
    );
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new AppError(
        413,
        "PAYLOAD_TOO_LARGE",
        "The request body is too large.",
      );
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    const body = await readBody(request, MAX_JSON_BODY_BYTES);
    return JSON.parse(new TextDecoder().decode(body));
  } catch (error) {
    if (error instanceof AppError) throw error;
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
