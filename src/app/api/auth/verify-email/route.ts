import { verifyEmailToken } from "@/features/auth/service";
import { handleApi } from "@/server/api";
import { AppError } from "@/server/security/errors";
import { enforceRateLimit } from "@/server/security/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleApi(request, async (context) => {
    await enforceRateLimit(
      { name: "verify-email", points: 20, duration: 60 * 60 },
      context.ipHash ?? "unknown",
    );
    const token = new URL(request.url).searchParams.get("token");
    if (!token)
      throw new AppError(
        400,
        "INVALID_TOKEN",
        "This verification link is invalid or expired.",
      );
    await verifyEmailToken(token, context);
    return { data: { verified: true } };
  });
}
