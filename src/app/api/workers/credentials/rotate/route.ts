import { handleApi } from "@/server/api";
import {
  authenticateCredentialRotation,
  rotateWorkerCredential,
} from "@/server/workers/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(request, async (context) => {
    const rotation = await authenticateCredentialRotation(request);
    const credential = await rotateWorkerCredential(rotation, context);
    return { data: credential, status: 201 };
  });
}
