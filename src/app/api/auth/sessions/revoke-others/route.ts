import { revokeOtherAppSessions } from "@/features/auth/sessions";
import { writeAudit } from "@/server/audit";
import { handleApi } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";
import { assertMutationOrigin } from "@/server/security/origin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(request, async (context) => {
    assertMutationOrigin(request);
    const user = await requireAuthenticatedUser();
    const revoked = await revokeOtherAppSessions(user.id, user.sessionId);
    await writeAudit({
      actorUserId: user.id,
      action: "auth.other_sessions_revoked",
      targetType: "session",
      requestId: context.requestId,
      ipHash: context.ipHash,
      metadata: { count: revoked },
    });
    return { data: { revoked } };
  });
}
