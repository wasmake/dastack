import { createHash, randomBytes } from "node:crypto";
import type { ClientSession, Types } from "mongoose";

import { AuthTokenModel } from "@/server/db/models";

export type AuthTokenType = "verify_email" | "reset_password" | "invitation";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueAuthToken(input: {
  type: AuthTokenType;
  identifier: string;
  userId?: Types.ObjectId | string | null;
  organizationId?: Types.ObjectId | string | null;
  invitationId?: Types.ObjectId | string | null;
  createdBy?: Types.ObjectId | string | null;
  expiresAt: Date;
  session?: ClientSession;
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await AuthTokenModel.create(
    [
      {
        ...input,
        digest: hashToken(token),
        identifier: input.identifier.toLowerCase(),
      },
    ],
    input.session ? { session: input.session } : undefined,
  );
  return token;
}

export async function consumeAuthToken(
  token: string,
  type: AuthTokenType,
  session?: ClientSession,
) {
  return AuthTokenModel.findOneAndUpdate(
    {
      digest: hashToken(token),
      type,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { returnDocument: "after", session },
  );
}
