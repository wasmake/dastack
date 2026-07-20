import { organizationIdSchema } from "@/features/organizations/schemas";
import { handleApi } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";
import { listWorkerNodes } from "@/server/workers/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleApi(request, async () => {
    const user = await requireAuthenticatedUser();
    const organizationId = organizationIdSchema.parse(
      new URL(request.url).searchParams.get("organizationId"),
    );
    return { data: await listWorkerNodes(organizationId, user.id) };
  });
}
