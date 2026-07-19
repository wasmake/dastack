import { handlers } from "@/auth";
import { getServerEnv } from "@/server/env";
import { getRequestContext } from "@/server/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function runAuth(request: Request, method: "GET" | "POST") {
  const context = getRequestContext(request);
  if (new URL(request.url).origin !== new URL(getServerEnv().APP_URL).origin) {
    return Response.json(
      {
        error: {
          code: "INVALID_HOST",
          message: "The request host was rejected.",
        },
        requestId: context.requestId,
      },
      {
        status: 400,
        headers: {
          "X-Request-Id": context.requestId,
          "Cache-Control": "no-store",
        },
      },
    );
  }
  const response = await handlers[method](request as never);
  const headers = new Headers(response.headers);
  headers.set("X-Request-Id", context.requestId);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function GET(request: Request) {
  return runAuth(request, "GET");
}

export async function POST(request: Request) {
  return runAuth(request, "POST");
}
