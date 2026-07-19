import type { Types } from "mongoose";

import { AuditLogModel } from "@/server/db/models";
import { connectMongoose } from "@/server/db/mongodb";
import { redactSecrets } from "@/server/security/redact";

export async function writeAudit(input: {
  organizationId?: Types.ObjectId | string | null;
  actorUserId?: Types.ObjectId | string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  requestId: string;
  ipHash?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await connectMongoose();
  await AuditLogModel.create({
    ...input,
    metadata: redactSecrets(input.metadata ?? {}),
  });
}
