import { organizationIdSchema } from "@/features/organizations/schemas";
import { projectIdSchema } from "@/features/projects/schemas";
import {
  deleteProject,
  getProject,
  updateProject,
} from "@/features/projects/service";
import { handleApi, readJson } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";
import { assertMutationOrigin } from "@/server/security/origin";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ organizationId: string; projectId: string }>;
};

async function parseParams(params: RouteParams["params"]) {
  const values = await params;
  return {
    organizationId: organizationIdSchema.parse(values.organizationId),
    projectId: projectIdSchema.parse(values.projectId),
  };
}

export async function GET(request: Request, { params }: RouteParams) {
  return handleApi(request, async () => {
    const user = await requireAuthenticatedUser();
    const ids = await parseParams(params);
    return {
      data: await getProject(ids.organizationId, ids.projectId, user.id),
    };
  });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  return handleApi(request, async (context) => {
    assertMutationOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = await parseParams(params);
    return {
      data: await updateProject(
        ids.organizationId,
        ids.projectId,
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
    const ids = await parseParams(params);
    return {
      data: await deleteProject(
        ids.organizationId,
        ids.projectId,
        user,
        context,
      ),
    };
  });
}
