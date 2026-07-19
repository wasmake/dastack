import { registerAccount } from "@/features/auth/service";
import { handleApi, readJson } from "@/server/api";
import { assertMutationOrigin } from "@/server/security/origin";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { digestIdentifier } from "@/server/security/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(request, async (context) => {
    assertMutationOrigin(request);
    const body = await readJson(request);
    const email =
      body &&
      typeof body === "object" &&
      typeof (body as Record<string, unknown>).email === "string"
        ? (body as Record<string, string>).email
        : "invalid";
    await Promise.all([
      enforceRateLimit(
        { name: "register-ip", points: 5, duration: 60 * 60 },
        context.ipHash ?? "unknown",
      ),
      enforceRateLimit(
        { name: "register-email", points: 3, duration: 60 * 60 },
        digestIdentifier(email.toLowerCase()),
      ),
    ]);
    await registerAccount(body, context);
    return {
      data: {
        message:
          "If registration can proceed, a verification email will arrive shortly.",
      },
      status: 202,
    };
  });
}
