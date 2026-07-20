import { environmentIdSchema } from "@/features/environments/schemas";
import {
  deleteEnvironment,
  getEnvironment,
  updateEnvironment,
} from "@/features/environments/service";
import { organizationIdSchema } from "@/features/organizations/schemas";
import { projectIdSchema } from "@/features/projects/schemas";
import { handleApi, readJson } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";
import { assertMutationOrigin } from "@/server/security/origin";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{
    organizationId: string;
    projectId: string;
    environmentId: string;
  }>;
};

async function parseParams(params: RouteParams["params"]) {
  const values = await params;
  return {
    organizationId: organizationIdSchema.parse(values.organizationId),
    projectId: projectIdSchema.parse(values.projectId),
    environmentId: environmentIdSchema.parse(values.environmentId),
  };
}

export async function GET(request: Request, { params }: RouteParams) {
  return handleApi(request, async () => {
    const user = await requireAuthenticatedUser();
    const ids = await parseParams(params);
    return {
      data: await getEnvironment(
        ids.organizationId,
        ids.projectId,
        ids.environmentId,
        user.id,
      ),
    };
  });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  return handleApi(request, async (context) => {
    assertMutationOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = await parseParams(params);
    return {
      data: await updateEnvironment(
        ids.organizationId,
        ids.projectId,
        ids.environmentId,
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
      data: await deleteEnvironment(
        ids.organizationId,
        ids.projectId,
        ids.environmentId,
        user,
        context,
      ),
    };
  });
}
