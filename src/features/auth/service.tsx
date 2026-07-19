import argon2 from "argon2";
import mongoose from "mongoose";

import {
  emailRequestSchema,
  passwordResetSchema,
  registrationSchema,
} from "@/features/auth/schemas";
import { consumeAuthToken, issueAuthToken } from "@/features/auth/tokens";
import { writeAudit } from "@/server/audit";
import { AppSessionModel, AuthTokenModel, UserModel } from "@/server/db/models";
import { connectMongoose } from "@/server/db/mongodb";
import { PasswordChangedEmail } from "@/server/email/templates/password-changed-email";
import { PasswordResetEmail } from "@/server/email/templates/password-reset-email";
import { VerifyEmail } from "@/server/email/templates/verify-email";
import { WelcomeEmail } from "@/server/email/templates/welcome-email";
import { sendTransactionalEmail } from "@/server/email/send";
import { getServerEnv } from "@/server/env";
import { AppError } from "@/server/security/errors";
import { secureLogError } from "@/server/security/redact";
import type { RequestContext } from "@/server/security/request";

const verifyLifetimeMs = 24 * 60 * 60 * 1_000;
const resetLifetimeMs = 30 * 60 * 1_000;

const argonOptions = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

async function sendWithoutExposingAccountState(
  operation: string,
  send: () => Promise<unknown>,
): Promise<void> {
  try {
    await send();
  } catch (error) {
    secureLogError(operation, error);
  }
}

export async function registerAccount(
  rawInput: unknown,
  context: RequestContext,
): Promise<void> {
  const input = registrationSchema.parse(rawInput);
  const passwordHash = await argon2.hash(input.password, argonOptions);
  await connectMongoose();

  const result = await mongoose.connection.transaction(async (session) => {
    const existing = await UserModel.findOne({ email: input.email })
      .select("+passwordHash")
      .session(session);
    if (existing?.emailVerified)
      return { userId: existing._id.toString(), token: null };

    const user =
      existing ??
      (
        await UserModel.create(
          [
            {
              name: input.name,
              email: input.email,
              passwordHash,
              termsAcceptedAt: new Date(),
              status: "active",
            },
          ],
          { session },
        )
      )[0];

    if (existing) {
      existing.name = input.name;
      existing.passwordHash = passwordHash;
      existing.termsAcceptedAt = new Date();
      await existing.save({ session });
    }

    await AuthTokenModel.updateMany(
      { identifier: input.email, type: "verify_email", usedAt: null },
      { $set: { usedAt: new Date() } },
      { session },
    );
    const token = await issueAuthToken({
      type: "verify_email",
      identifier: input.email,
      userId: user._id,
      expiresAt: new Date(Date.now() + verifyLifetimeMs),
      session,
    });
    return { userId: user._id.toString(), token };
  });

  await writeAudit({
    actorUserId: null,
    action: result.token
      ? "auth.registration_requested"
      : "auth.registration_duplicate",
    targetType: "user",
    targetId: result.userId,
    requestId: context.requestId,
    ipHash: context.ipHash,
  });

  if (result.token) {
    const url = new URL("/verify-email", getServerEnv().APP_URL);
    url.searchParams.set("token", result.token);
    await sendWithoutExposingAccountState(
      "email.verification_delivery_failed",
      () =>
        sendTransactionalEmail({
          to: input.email,
          subject: "Verify your DaStack email",
          template: "verify_email",
          react: (
            <VerifyEmail
              verificationUrl={url.toString()}
              expiresIn="24 hours"
            />
          ),
          userId: result.userId,
        }),
    );
  }
}

export async function verifyEmailToken(
  token: string,
  context: RequestContext,
): Promise<void> {
  if (token.length < 32 || token.length > 512)
    throw new AppError(
      400,
      "INVALID_TOKEN",
      "This verification link is invalid or expired.",
    );
  await connectMongoose();

  const user = await mongoose.connection.transaction(async (session) => {
    const authToken = await consumeAuthToken(token, "verify_email", session);
    if (!authToken?.userId) {
      throw new AppError(
        400,
        "INVALID_TOKEN",
        "This verification link is invalid or expired.",
      );
    }
    const updated = await UserModel.findOneAndUpdate(
      {
        _id: authToken.userId,
        email: authToken.identifier,
        emailVerified: null,
        status: "active",
      },
      { $set: { emailVerified: new Date() } },
      { returnDocument: "after", session },
    );
    if (!updated)
      throw new AppError(
        400,
        "INVALID_TOKEN",
        "This verification link is invalid or expired.",
      );
    return {
      id: updated._id.toString(),
      email: updated.email,
      name: updated.name,
    };
  });

  await writeAudit({
    actorUserId: user.id,
    action: "auth.email_verified",
    targetType: "user",
    targetId: user.id,
    requestId: context.requestId,
    ipHash: context.ipHash,
  });
  await sendWithoutExposingAccountState("email.welcome_delivery_failed", () =>
    sendTransactionalEmail({
      to: user.email,
      subject: "Welcome to DaStack",
      template: "welcome",
      react: <WelcomeEmail name={user.name} />,
      userId: user.id,
    }),
  );
}

export async function resendVerification(
  rawInput: unknown,
  context: RequestContext,
): Promise<void> {
  const { email } = emailRequestSchema.parse(rawInput);
  await connectMongoose();

  const result = await mongoose.connection.transaction(async (session) => {
    const user = await UserModel.findOne({
      email,
      emailVerified: null,
      status: "active",
    })
      .select("+passwordHash")
      .session(session);
    if (!user) return null;
    if (!user.passwordHash) return null;

    await AuthTokenModel.updateMany(
      { identifier: email, type: "verify_email", usedAt: null },
      { $set: { usedAt: new Date() } },
      { session },
    );
    const token = await issueAuthToken({
      type: "verify_email",
      identifier: email,
      userId: user._id,
      expiresAt: new Date(Date.now() + verifyLifetimeMs),
      session,
    });
    return { token, userId: user._id.toString() };
  });

  await writeAudit({
    actorUserId: null,
    action: "auth.verification_resent",
    targetType: "email",
    requestId: context.requestId,
    ipHash: context.ipHash,
    metadata: { accountMatched: Boolean(result) },
  });
  if (result) {
    const url = new URL("/verify-email", getServerEnv().APP_URL);
    url.searchParams.set("token", result.token);
    await sendWithoutExposingAccountState(
      "email.verification_delivery_failed",
      () =>
        sendTransactionalEmail({
          to: email,
          subject: "Verify your DaStack email",
          template: "verify_email",
          react: (
            <VerifyEmail
              verificationUrl={url.toString()}
              expiresIn="24 hours"
            />
          ),
          userId: result.userId,
        }),
    );
  }
}

export async function requestPasswordReset(
  rawInput: unknown,
  context: RequestContext,
): Promise<void> {
  const { email } = emailRequestSchema.parse(rawInput);
  await connectMongoose();
  const user = await UserModel.findOne({
    email,
    emailVerified: { $ne: null },
    status: "active",
  });
  let token: string | null = null;

  if (user) {
    await AuthTokenModel.updateMany(
      { userId: user._id, type: "reset_password", usedAt: null },
      { $set: { usedAt: new Date() } },
    );
    token = await issueAuthToken({
      type: "reset_password",
      identifier: email,
      userId: user._id,
      expiresAt: new Date(Date.now() + resetLifetimeMs),
    });
  }

  await writeAudit({
    actorUserId: null,
    action: "auth.password_reset_requested",
    targetType: "email",
    targetId: user?._id.toString(),
    requestId: context.requestId,
    ipHash: context.ipHash,
    metadata: { accountMatched: Boolean(user) },
  });
  if (user && token) {
    const url = new URL("/reset-password", getServerEnv().APP_URL);
    url.searchParams.set("token", token);
    await sendWithoutExposingAccountState(
      "email.password_reset_delivery_failed",
      () =>
        sendTransactionalEmail({
          to: email,
          subject: "Reset your DaStack password",
          template: "password_reset",
          react: (
            <PasswordResetEmail
              resetUrl={url.toString()}
              expiresIn="30 minutes"
            />
          ),
          userId: user._id.toString(),
        }),
    );
  }
}

export async function resetPassword(
  rawInput: unknown,
  context: RequestContext,
): Promise<void> {
  const input = passwordResetSchema.parse(rawInput);
  const passwordHash = await argon2.hash(input.password, argonOptions);
  await connectMongoose();

  const user = await mongoose.connection.transaction(async (session) => {
    const token = await consumeAuthToken(
      input.token,
      "reset_password",
      session,
    );
    if (!token?.userId)
      throw new AppError(
        400,
        "INVALID_TOKEN",
        "This password reset link is invalid or expired.",
      );
    const updated = await UserModel.findOneAndUpdate(
      {
        _id: token.userId,
        email: token.identifier,
        emailVerified: { $ne: null },
        status: "active",
      },
      { $set: { passwordHash }, $inc: { tokenVersion: 1 } },
      { returnDocument: "after", session },
    );
    if (!updated)
      throw new AppError(
        400,
        "INVALID_TOKEN",
        "This password reset link is invalid or expired.",
      );
    await AppSessionModel.updateMany(
      { userId: updated._id, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: "password_reset" } },
      { session },
    );
    return { id: updated._id.toString(), email: updated.email };
  });

  await writeAudit({
    actorUserId: user.id,
    action: "auth.password_reset_completed",
    targetType: "user",
    targetId: user.id,
    requestId: context.requestId,
    ipHash: context.ipHash,
  });
  await sendWithoutExposingAccountState(
    "email.password_changed_delivery_failed",
    () =>
      sendTransactionalEmail({
        to: user.email,
        subject: "Your DaStack password was changed",
        template: "password_changed",
        react: <PasswordChangedEmail changedAt={new Date().toISOString()} />,
        userId: user.id,
      }),
  );
}

export { argonOptions };
