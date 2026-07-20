import { handleApi } from "@/server/api";
import {
  authenticateHeartbeat,
  persistHeartbeat,
} from "@/server/workers/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(request, async (context) => {
    const heartbeat = await authenticateHeartbeat(request);
    const result = await persistHeartbeat(heartbeat, context);
    return { data: result, status: 202 };
  });
}
