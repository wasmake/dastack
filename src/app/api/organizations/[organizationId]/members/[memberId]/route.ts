import {
  changeMemberRole,
  removeMember,
} from "@/features/organizations/service";
import { organizationIdSchema } from "@/features/organizations/schemas";
import { handleApi, readJson } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";
import { assertMutationOrigin } from "@/server/security/origin";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ organizationId: string; memberId: string }>;
};

export async function PATCH(request: Request, { params }: RouteParams) {
  return handleApi(request, async (context) => {
    assertMutationOrigin(request);
    const user = await requireAuthenticatedUser();
    const values = await params;
    const organizationId = organizationIdSchema.parse(values.organizationId);
    const memberId = organizationIdSchema.parse(values.memberId);
    return {
      data: await changeMemberRole(
        organizationId,
        memberId,
        await readJson(request),
        user,
        context,
      ),
    };
  });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  return handleApi(request, async (context) => {
    assertMutationOrigin(request);
    const user = await requireAuthenticatedUser();
    const values = await params;
    const organizationId = organizationIdSchema.parse(values.organizationId);
    const memberId = organizationIdSchema.parse(values.memberId);
    await removeMember(organizationId, memberId, user, context);
    return { data: { removed: true } };
  });
}
