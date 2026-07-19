import { nanoid } from "nanoid";

export async function GET() {
  const requestId = nanoid(20);
  return Response.json(
    {
      data: { status: "alive", timestamp: new Date().toISOString() },
      requestId,
    },
    { headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } },
  );
}
