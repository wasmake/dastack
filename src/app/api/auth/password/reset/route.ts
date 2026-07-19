import { resetPassword } from "@/features/auth/service";
import { handleApi, readJson } from "@/server/api";
import { assertMutationOrigin } from "@/server/security/origin";
import { enforceRateLimit } from "@/server/security/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(request, async (context) => {
    assertMutationOrigin(request);
    await enforceRateLimit(
      { name: "password-reset", points: 8, duration: 60 * 60 },
      context.ipHash ?? "unknown",
    );
    await resetPassword(await readJson(request), context);
    return { data: { reset: true } };
  });
}
