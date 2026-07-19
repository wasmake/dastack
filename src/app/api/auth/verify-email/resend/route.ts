import { resendVerification } from "@/features/auth/service";
import { handleApi, readJson } from "@/server/api";
import { assertMutationOrigin } from "@/server/security/origin";
import { enforceRateLimit } from "@/server/security/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(request, async (context) => {
    assertMutationOrigin(request);
    await enforceRateLimit(
      { name: "resend-verification", points: 3, duration: 60 * 60 },
      context.ipHash ?? "unknown",
    );
    await resendVerification(await readJson(request), context);
    return {
      data: {
        message:
          "If the account is eligible, a verification email will arrive shortly.",
      },
      status: 202,
    };
  });
}
