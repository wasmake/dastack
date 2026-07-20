import { handleApi, readJson } from "@/server/api";
import {
  assertSecureWorkerTransport,
  enrollWorker,
  readEnrollmentToken,
} from "@/server/workers/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(request, async (context) => {
    assertSecureWorkerTransport(request);
    const token = readEnrollmentToken(request);
    const body = await readJson(request);
    const enrollment = await enrollWorker(body, token, context);
    return { data: enrollment, status: 201 };
  });
}
