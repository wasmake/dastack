import { organizationIdSchema } from "@/features/organizations/schemas";
import { confirmResourceReservation } from "@/features/resources/reservations";
import { reservationIdSchema } from "@/features/resources/schemas";
import { handleApi } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";
import { assertMutationOrigin } from "@/server/security/origin";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ organizationId: string; reservationId: string }> },
) {
  return handleApi(request, async (context) => {
    assertMutationOrigin(request);
    const user = await requireAuthenticatedUser();
    const values = await params;
    return {
      data: await confirmResourceReservation(
        organizationIdSchema.parse(values.organizationId),
        reservationIdSchema.parse(values.reservationId),
        user,
        context,
      ),
    };
  });
}
