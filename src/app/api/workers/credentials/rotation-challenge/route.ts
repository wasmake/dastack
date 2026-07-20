import { handleApi } from "@/server/api";
import {
  authenticateCredentialRotationChallenge,
  createCredentialRotationChallenge,
} from "@/server/workers/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(request, async () => {
    const authenticated =
      await authenticateCredentialRotationChallenge(request);
    const challenge = await createCredentialRotationChallenge(authenticated);
    return { data: challenge, status: 201 };
  });
}
