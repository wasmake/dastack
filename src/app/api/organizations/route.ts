import {
  createOrganization,
  listOrganizations,
} from "@/features/organizations/service";
import { handleApi, readJson } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";
import { assertMutationOrigin } from "@/server/security/origin";
import { enforceRateLimit } from "@/server/security/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleApi(request, async () => {
    const user = await requireAuthenticatedUser();
    return { data: await listOrganizations(user.id) };
  });
}

export async function POST(request: Request) {
  return handleApi(request, async (context) => {
    assertMutationOrigin(request);
    const user = await requireAuthenticatedUser();
    await enforceRateLimit(
      { name: "organization-create", points: 10, duration: 60 * 60 },
      user.id,
    );
    return {
      data: await createOrganization(await readJson(request), user, context),
      status: 201,
    };
  });
}
