import { nanoid } from "nanoid";

import { AppSessionModel, UserModel } from "@/server/db/models";
import { connectMongoose } from "@/server/db/mongodb";
import { AppError } from "@/server/security/errors";
import type { RequestContext } from "@/server/security/request";

const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1_000;

export async function createAppSession(input: {
  userId: string;
  provider: string;
  remember?: boolean;
  context?: RequestContext | null;
}): Promise<{ sessionId: string; tokenVersion: number }> {
  await connectMongoose();
  const user = await UserModel.findOne({ _id: input.userId, status: "active" });
  if (!user)
    throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  const sessionId = nanoid(32);
  await AppSessionModel.create({
    sessionId,
    userId: user._id,
    tokenVersion: user.tokenVersion,
    provider: input.provider,
    ipHash: input.context?.ipHash ?? null,
    userAgent: input.context?.userAgent ?? null,
    lastSeenAt: new Date(),
    expiresAt: new Date(
      Date.now() + (input.remember ? sessionLifetimeMs : 24 * 60 * 60 * 1_000),
    ),
  });
  return { sessionId, tokenVersion: user.tokenVersion };
}

export async function validateAppSession(input: {
  sessionId: string;
  userId: string;
  tokenVersion: number;
}): Promise<boolean> {
  await connectMongoose();
  const session = await AppSessionModel.findOne({
    sessionId: input.sessionId,
    userId: input.userId,
    tokenVersion: input.tokenVersion,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!session) return false;
  const user = await UserModel.exists({
    _id: input.userId,
    tokenVersion: input.tokenVersion,
    status: "active",
  });
  if (!user) return false;

  if (session.lastSeenAt.getTime() < Date.now() - 5 * 60 * 1_000) {
    await AppSessionModel.updateOne(
      { _id: session._id, revokedAt: null },
      { $set: { lastSeenAt: new Date() } },
    );
  }
  return true;
}

export async function listAppSessions(
  userId: string,
  currentSessionId: string,
) {
  await connectMongoose();
  const sessions = await AppSessionModel.find({
    userId,
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastSeenAt: -1 })
    .lean();
  return sessions.map((session) => ({
    id: session.sessionId,
    provider: session.provider,
    userAgent: session.userAgent,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    current: session.sessionId === currentSessionId,
  }));
}

export async function revokeAppSession(
  userId: string,
  sessionId: string,
  reason = "user_revoked",
): Promise<void> {
  await connectMongoose();
  const result = await AppSessionModel.updateOne(
    { userId, sessionId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
  if (!result.matchedCount)
    throw new AppError(404, "SESSION_NOT_FOUND", "The session was not found.");
}

export async function revokeOtherAppSessions(
  userId: string,
  currentSessionId: string,
): Promise<number> {
  await connectMongoose();
  const result = await AppSessionModel.updateMany(
    { userId, sessionId: { $ne: currentSessionId }, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: "user_revoked_others" } },
  );
  return result.modifiedCount;
}
