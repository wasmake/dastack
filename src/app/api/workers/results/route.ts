import { handleApi } from "@/server/api";
import {
  authenticateWorkerResult,
  persistWorkerResult,
} from "@/server/workers/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(request, async (context) => {
    const result = await authenticateWorkerResult(request);
    const persisted = await persistWorkerResult(result, context);
    return { data: persisted, status: 202 };
  });
}
