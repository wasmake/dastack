import { z } from "zod";

import { getPublishedTemplate } from "@/features/service-templates/service";
import { handleApi } from "@/server/api";

export const runtime = "nodejs";

const paramsSchema = z.object({
  templateId: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  manifestVersion: z.coerce.number().int().positive(),
});

export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ templateId: string; manifestVersion: string }> },
) {
  return handleApi(request, async () => {
    const values = paramsSchema.parse(await params);
    return {
      data: await getPublishedTemplate(
        values.templateId,
        values.manifestVersion,
      ),
    };
  });
}
