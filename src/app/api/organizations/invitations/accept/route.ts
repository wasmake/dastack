import { acceptInvitationSchema } from "@/features/organizations/schemas";
import { acceptInvitation } from "@/features/organizations/service";
import { handleApi, readJson } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";
import { assertMutationOrigin } from "@/server/security/origin";
import { enforceRateLimit } from "@/server/security/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(request, async (context) => {
    assertMutationOrigin(request);
    const user = await requireAuthenticatedUser();
    await enforceRateLimit(
      { name: "invitation-accept", points: 10, duration: 60 * 60 },
      user.id,
    );
    const { token } = acceptInvitationSchema.parse(await readJson(request));
    return { data: await acceptInvitation(token, user, context) };
  });
}
