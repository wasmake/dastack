import { revokeAppSession } from "@/features/auth/sessions";
import { writeAudit } from "@/server/audit";
import { handleApi } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";
import { assertMutationOrigin } from "@/server/security/origin";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  return handleApi(request, async (context) => {
    assertMutationOrigin(request);
    const user = await requireAuthenticatedUser();
    const { sessionId } = await params;
    await revokeAppSession(user.id, sessionId);
    await writeAudit({
      actorUserId: user.id,
      action: "auth.session_revoked",
      targetType: "session",
      targetId: sessionId,
      requestId: context.requestId,
      ipHash: context.ipHash,
    });
    return { data: { revoked: true } };
  });
}
