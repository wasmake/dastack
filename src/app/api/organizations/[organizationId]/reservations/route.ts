import { organizationIdSchema } from "@/features/organizations/schemas";
import { reserveResource } from "@/features/resources/reservations";
import { handleApi, readJson } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/security/errors";
import { assertMutationOrigin } from "@/server/security/origin";
import { enforceRateLimit } from "@/server/security/rate-limit";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  return handleApi(request, async (context) => {
    assertMutationOrigin(request);
    const user = await requireAuthenticatedUser();
    const organizationId = organizationIdSchema.parse(
      (await params).organizationId,
    );
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new AppError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "An Idempotency-Key header is required.",
      );
    }
    await enforceRateLimit(
      { name: "resource-reservation", points: 60, duration: 60 },
      `${organizationId}:${user.id}`,
    );
    return {
      data: await reserveResource(
        organizationId,
        await readJson(request),
        idempotencyKey,
        user,
        context,
      ),
      status: 201,
    };
  });
}
