import { z } from "zod";

import { getPublishedTemplate } from "@/features/service-templates/service";
import { handleApi } from "@/server/api";

export const runtime = "nodejs";

const templateIdSchema = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  return handleApi(request, async () => ({
    data: await getPublishedTemplate(
      templateIdSchema.parse((await params).templateId),
    ),
  }));
}
