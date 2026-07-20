import { organizationIdSchema } from "@/features/organizations/schemas";
import { createProject, listProjects } from "@/features/projects/service";
import { handleApi, readJson } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";
import { assertMutationOrigin } from "@/server/security/origin";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  return handleApi(request, async () => {
    const user = await requireAuthenticatedUser();
    const organizationId = organizationIdSchema.parse(
      (await params).organizationId,
    );
    return { data: await listProjects(organizationId, user.id) };
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  return handleApi(request, async (context) => {
    assertMutationOrigin(request);
    const user = await requireAuthenticatedUser();
    const organizationId = organizationIdSchema.parse(
      (await params).organizationId,
    );
    return {
      data: await createProject(
        organizationId,
        await readJson(request),
        user,
        context,
      ),
      status: 201,
    };
  });
}
