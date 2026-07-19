import { organizationIdSchema } from "@/features/organizations/schemas";
import { revokeInvitation } from "@/features/organizations/service";
import { handleApi } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";
import { assertMutationOrigin } from "@/server/security/origin";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  {
    params,
  }: { params: Promise<{ organizationId: string; invitationId: string }> },
) {
  return handleApi(request, async (context) => {
    assertMutationOrigin(request);
    const user = await requireAuthenticatedUser();
    const values = await params;
    const organizationId = organizationIdSchema.parse(values.organizationId);
    const invitationId = organizationIdSchema.parse(values.invitationId);
    return {
      data: await revokeInvitation(organizationId, invitationId, user, context),
    };
  });
}
