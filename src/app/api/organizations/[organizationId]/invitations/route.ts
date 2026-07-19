import {
  inviteMember,
  listInvitations,
} from "@/features/organizations/service";
import { organizationIdSchema } from "@/features/organizations/schemas";
import { handleApi, readJson } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";
import { assertMutationOrigin } from "@/server/security/origin";
import { enforceRateLimit } from "@/server/security/rate-limit";

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
    return { data: await listInvitations(organizationId, user.id) };
  });
}

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
    await enforceRateLimit(
      { name: "organization-invite", points: 30, duration: 60 * 60 },
      `${organizationId}:${user.id}`,
    );
    return {
      data: await inviteMember(
        organizationId,
        await readJson(request),
        user,
        context,
      ),
      status: 201,
    };
  });
}
