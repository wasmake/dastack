import { readiness } from "@/app/api/health/ready/route";
import { nanoid } from "nanoid";

export async function GET() {
  const requestId = nanoid(20);
  const result = await readiness();
  return Response.json(
    {
      data: { status: result.ready ? "healthy" : "unavailable", ...result },
      requestId,
    },
    {
      status: result.ready ? 200 : 503,
      headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" },
    },
  );
}
