import { organizationIdSchema } from "@/features/organizations/schemas";
import { transferOwnership } from "@/features/organizations/service";
import { handleApi, readJson } from "@/server/api";
import { requireAuthenticatedUser } from "@/server/authorization";
import { assertMutationOrigin } from "@/server/security/origin";

export const runtime = "nodejs";

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
    return {
      data: await transferOwnership(
        organizationId,
        await readJson(request),
        user,
        context,
      ),
    };
  });
}
