import { listAppSessions } from "@/features/auth/sessions";
import { handleApi } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleApi(request, async () => {
    const user = await requireAuthenticatedUser();
    return { data: await listAppSessions(user.id, user.sessionId) };
  });
}
