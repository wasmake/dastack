import { organizationIdSchema } from "@/features/organizations/schemas";
import { getResourceReservation } from "@/features/resources/reservations";
import { reservationIdSchema } from "@/features/resources/schemas";
import { handleApi } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ organizationId: string; reservationId: string }> },
) {
  return handleApi(request, async () => {
    const user = await requireAuthenticatedUser();
    const values = await params;
    return {
      data: await getResourceReservation(
        organizationIdSchema.parse(values.organizationId),
        reservationIdSchema.parse(values.reservationId),
        user.id,
      ),
    };
  });
}
