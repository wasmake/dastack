import { getOrganization } from "@/features/organizations/service";
import { organizationIdSchema } from "@/features/organizations/schemas";
import { handleApi } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  return handleApi(request, async () => {
    const user = await requireAuthenticatedUser();
    const organizationId = organizationIdSchema.parse(
      (await params).organizationId,
    );
    return { data: await getOrganization(organizationId, user.id) };
  });
}
