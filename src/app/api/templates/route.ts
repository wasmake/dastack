import { listPublishedTemplates } from "@/features/service-templates/service";
import { handleApi } from "@/server/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleApi(request, async () => ({
    data: await listPublishedTemplates(),
  }));
}
