import argon2 from "argon2";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import ResendProvider from "next-auth/providers/resend";
import { createElement } from "react";

import { normalizeEmail, credentialsSchema } from "@/features/auth/schemas";
import {
  createAppSession,
  validateAppSession,
  revokeAppSession,
} from "@/features/auth/sessions";
import { hashToken } from "@/features/auth/tokens";
import { writeAudit } from "@/server/audit";
import { UserModel } from "@/server/db/models";
import { connectMongoose, getMongoClientPromise } from "@/server/db/mongodb";
import { sendTransactionalEmail } from "@/server/email/send";
import { MagicLinkEmail } from "@/server/email/templates/magic-link-email";
import { getServerEnv } from "@/server/env";
import { assertMutationOrigin } from "@/server/security/origin";
import { clearRateLimit, enforceRateLimit } from "@/server/security/rate-limit";
import { secureLogError } from "@/server/security/redact";
import { digestIdentifier, getRequestContext } from "@/server/security/request";

const loginIdentityPolicy = {
  name: "login-identity",
  points: 8,
  duration: 15 * 60,
  blockDuration: 30 * 60,
};
const loginIpPolicy = {
  name: "login-ip",
  points: 40,
  duration: 60 * 60,
  blockDuration: 60 * 60,
};
const magicLinkPolicy = {
  name: "magic-link",
  points: 5,
  duration: 60 * 60,
  blockDuration: 60 * 60,
};
const dummyPasswordHash =
  "$argon2id$v=19$m=65536,p=1,t=3$nixdN4kECSI3AhEFDRx+0g$/8HohEYqapX/yyJyBJ7T9EwU/vF3lnlXxBFP5gFCNK8";

function authAdapter() {
  const env = getServerEnv();
  const adapter = MongoDBAdapter(getMongoClientPromise, {
    databaseName: env.MONGODB_DB,
  });
  return {
    ...adapter,
    async createUser(
      user: Parameters<NonNullable<typeof adapter.createUser>>[0],
    ) {
      const now = new Date();
      return adapter.createUser!({
        ...user,
        email: normalizeEmail(user.email),
        status: "active",
        tokenVersion: 0,
        createdAt: now,
        updatedAt: now,
      } as Parameters<NonNullable<typeof adapter.createUser>>[0]);
    },
    async getUserByEmail(email: string) {
      return adapter.getUserByEmail!(normalizeEmail(email));
    },
    async updateUser(
      user: Parameters<NonNullable<typeof adapter.updateUser>>[0],
    ) {
      return adapter.updateUser!({
        ...user,
        ...(user.email ? { email: normalizeEmail(user.email) } : {}),
        updatedAt: new Date(),
      } as Parameters<NonNullable<typeof adapter.updateUser>>[0]);
    },
    async linkAccount(
      account: Parameters<NonNullable<typeof adapter.linkAccount>>[0],
    ): Promise<void> {
      const now = new Date();
      await adapter.linkAccount!({
        ...account,
        createdAt: now,
        updatedAt: now,
      } as unknown as typeof account);
    },
    async createVerificationToken(
      data: Parameters<NonNullable<typeof adapter.createVerificationToken>>[0],
    ) {
      await adapter.createVerificationToken!({
        ...data,
        identifier: normalizeEmail(data.identifier),
        token: hashToken(data.token),
      });
      return data;
    },
    async useVerificationToken(
      data: Parameters<NonNullable<typeof adapter.useVerificationToken>>[0],
    ) {
      const result = await adapter.useVerificationToken!({
        identifier: normalizeEmail(data.identifier),
        token: hashToken(data.token),
      });
      return result ? { ...result, token: data.token } : null;
    },
  };
}

async function githubEmailIsVerified(
  accessToken: string | undefined,
  email: string,
): Promise<boolean> {
  if (!accessToken) return false;
  const response = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "dastack",
    },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return false;
  const emails: unknown = await response.json();
  return (
    Array.isArray(emails) &&
    emails.some((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const value = entry as Record<string, unknown>;
      return (
        value.verified === true &&
        typeof value.email === "string" &&
        normalizeEmail(value.email) === email
      );
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth((request) => {
  const env = getServerEnv();
  const requestContext = request ? getRequestContext(request) : null;

  return {
    adapter: authAdapter(),
    secret: env.AUTH_SECRET,
    // The route validates the public host before Auth.js is allowed to trust it.
    trustHost: true,
    session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60, updateAge: 5 * 60 },
    providers: [
      GitHub({
        clientId: env.AUTH_GITHUB_ID ?? "",
        clientSecret: env.AUTH_GITHUB_SECRET ?? "",
        allowDangerousEmailAccountLinking: false,
      }),
      Google({
        clientId: env.AUTH_GOOGLE_ID ?? "",
        clientSecret: env.AUTH_GOOGLE_SECRET ?? "",
        allowDangerousEmailAccountLinking: false,
      }),
      Credentials({
        credentials: { email: {}, password: {}, remember: {} },
        async authorize(rawCredentials, authorizeRequest) {
          try {
            assertMutationOrigin(authorizeRequest);
            const credentials = credentialsSchema.parse({
              email: rawCredentials.email,
              password: rawCredentials.password,
              remember: rawCredentials.remember,
            });
            const context = getRequestContext(authorizeRequest);
            const identityKey = `${context.ipHash}:${digestIdentifier(credentials.email)}`;
            await Promise.all([
              enforceRateLimit(loginIdentityPolicy, identityKey),
              enforceRateLimit(loginIpPolicy, context.ipHash ?? "unknown"),
            ]);

            await connectMongoose();
            const user = await UserModel.findOne({
              email: credentials.email,
              status: "active",
            }).select("+passwordHash");
            const valid = await argon2
              .verify(
                user?.passwordHash ?? dummyPasswordHash,
                credentials.password,
              )
              .catch(() => false);
            if (!user || !valid || !user.emailVerified || !user.passwordHash) {
              await enforceRateLimit(loginIdentityPolicy, identityKey, 2);
              return null;
            }

            await clearRateLimit(loginIdentityPolicy, identityKey);
            await UserModel.updateOne(
              { _id: user._id },
              { $set: { lastLoginAt: new Date() } },
            );
            return {
              id: user._id.toString(),
              email: user.email,
              name: user.name,
              image: user.image,
              rememberSession: credentials.remember === "true",
            };
          } catch (error) {
            secureLogError("auth.credentials_rejected", error, {
              requestId: requestContext?.requestId,
            });
            return null;
          }
        },
      }),
      ResendProvider({
        apiKey: env.RESEND_API_KEY ?? "development-file-transport",
        from: env.EMAIL_FROM,
        maxAge: 15 * 60,
        normalizeIdentifier: normalizeEmail,
        async sendVerificationRequest({
          identifier,
          url,
          request: emailRequest,
        }) {
          assertMutationOrigin(emailRequest);
          const context = getRequestContext(emailRequest);
          await Promise.all([
            enforceRateLimit(magicLinkPolicy, digestIdentifier(identifier)),
            enforceRateLimit(magicLinkPolicy, context.ipHash ?? "unknown"),
          ]);
          await sendTransactionalEmail({
            to: normalizeEmail(identifier),
            subject: "Your DaStack sign-in link",
            template: "magic_link",
            react: createElement(MagicLinkEmail, {
              signInUrl: url,
              expiresIn: "15 minutes",
            }),
          });
        },
      }),
    ],
    callbacks: {
      async signIn({ user, account, profile }) {
        if (!account || !user.email) return false;
        user.email = normalizeEmail(user.email);
        if (requestContext) {
          await enforceRateLimit(
            {
              name: "signin-provider",
              points: 30,
              duration: 15 * 60,
              blockDuration: 15 * 60,
            },
            requestContext.ipHash ?? "unknown",
          );
        }
        if (account.provider === "google")
          return profile?.email_verified === true;
        if (account.provider === "github")
          return githubEmailIsVerified(account.access_token, user.email);
        return (
          account.provider === "credentials" || account.provider === "resend"
        );
      },
      async jwt({ token, user, account, trigger }) {
        if (
          (trigger === "signIn" || trigger === "signUp") &&
          user.id &&
          account
        ) {
          const appSession = await createAppSession({
            userId: user.id,
            provider: account.provider,
            remember:
              account.provider === "credentials" ? user.rememberSession : true,
            context: requestContext,
          });
          token.sessionId = appSession.sessionId;
          token.tokenVersion = appSession.tokenVersion;
          token.sub = user.id;
        }
        if (
          token.sub &&
          typeof token.sessionId === "string" &&
          typeof token.tokenVersion === "number"
        ) {
          const active = await validateAppSession({
            userId: token.sub,
            sessionId: token.sessionId,
            tokenVersion: token.tokenVersion,
          });
          if (!active) return null;
        }
        return token;
      },
      async session({ session, token }) {
        if (token.sub) session.user.id = token.sub;
        session.sessionId =
          typeof token.sessionId === "string" ? token.sessionId : "";
        session.tokenVersion =
          typeof token.tokenVersion === "number" ? token.tokenVersion : -1;
        return session;
      },
    },
    events: {
      async signIn({ user, account }) {
        if (
          user.id &&
          (account?.provider === "google" || account?.provider === "github")
        ) {
          await connectMongoose();
          await UserModel.updateOne(
            { _id: user.id, emailVerified: null },
            { $set: { emailVerified: new Date() } },
          );
        }
        if (requestContext) {
          await writeAudit({
            actorUserId: user.id,
            action: "auth.signed_in",
            targetType: "user",
            targetId: user.id,
            requestId: requestContext.requestId,
            ipHash: requestContext.ipHash,
            metadata: { provider: account?.provider },
          });
        }
      },
      async signOut(message) {
        if (
          "token" in message &&
          typeof message.token?.sessionId === "string" &&
          message.token.sub
        ) {
          await revokeAppSession(
            message.token.sub,
            message.token.sessionId,
            "signed_out",
          ).catch(() => undefined);
        }
      },
    },
    logger: {
      error(error) {
        secureLogError("auth.error", error, {
          requestId: requestContext?.requestId,
        });
      },
      warn(code) {
        secureLogError(
          "auth.warning",
          { code },
          { requestId: requestContext?.requestId },
        );
      },
      debug() {},
    },
  };
});
