import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import argon2 from "argon2";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testEmail = `integration-${process.pid}@example.test`;
let emailDirectory: string;

vi.mock("@/server/authorization", () => ({
  requireOrganizationPermission: vi.fn(),
}));

beforeAll(async () => {
  emailDirectory = await mkdtemp(path.join(tmpdir(), "dastack-email-test-"));
  process.env.APP_URL = "http://localhost:3000";
  process.env.AUTH_SECRET =
    "integration-auth-secret-with-at-least-thirty-two-bytes";
  process.env.MONGODB_DB = "dastack";
  process.env.MONGODB_URI =
    "mongodb://dastack:change-me-local-mongo-app@127.0.0.1:27017/dastack?authSource=dastack&replicaSet=rs0&directConnection=true";
  process.env.EMAIL_ADAPTER = "file";
  process.env.EMAIL_DEV_DIR = emailDirectory;
  process.env.EMAIL_FROM = "DaStack Test <no-reply@example.test>";
  process.env.TRUST_PROXY = "false";
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    const user = await mongoose.connection
      .collection("users")
      .findOne({ email: testEmail });
    if (user) {
      const organizationIds = await mongoose.connection
        .collection("organizations")
        .find({ createdBy: user._id })
        .map((organization) => organization._id)
        .toArray();
      await Promise.all([
        mongoose.connection
          .collection("organization_members")
          .deleteMany({ organizationId: { $in: organizationIds } }),
        mongoose.connection
          .collection("roles")
          .deleteMany({ organizationId: { $in: organizationIds } }),
        mongoose.connection
          .collection("invitations")
          .deleteMany({ organizationId: { $in: organizationIds } }),
        mongoose.connection
          .collection("organizations")
          .deleteMany({ _id: { $in: organizationIds } }),
        mongoose.connection
          .collection("auth_tokens")
          .deleteMany({ identifier: testEmail }),
        mongoose.connection
          .collection("email_deliveries")
          .deleteMany({ userId: user._id }),
        mongoose.connection
          .collection("audit_logs")
          .deleteMany({ actorUserId: user._id }),
        mongoose.connection
          .collection("app_sessions")
          .deleteMany({ userId: user._id }),
        mongoose.connection
          .collection("accounts")
          .deleteMany({ userId: user._id }),
        mongoose.connection
          .collection("sessions")
          .deleteMany({ userId: user._id }),
        mongoose.connection.collection("users").deleteOne({ _id: user._id }),
      ]);
    }
    await mongoose.disconnect();
  }
  await rm(emailDirectory, { recursive: true, force: true });
});

describe("foundation integration", () => {
  it("registers and verifies an account using a hashed one-time token", async () => {
    const { registerAccount, verifyEmailToken } =
      await import("../../src/features/auth/service");
    const { AuthTokenModel, UserModel } =
      await import("../../src/server/db/models");
    const context = {
      requestId: "integration-registration",
      ipHash: "test-ip",
      userAgent: "vitest",
    };

    await registerAccount(
      {
        name: "Integration User",
        email: testEmail,
        password: "Strong-Integration-42!",
        passwordConfirmation: "Strong-Integration-42!",
        termsAccepted: true,
      },
      context,
    );

    const storedToken = await AuthTokenModel.findOne({
      identifier: testEmail,
    }).lean();
    expect(storedToken?.digest).toMatch(/^[a-f0-9]{64}$/);
    const [messageFile] = await readdir(emailDirectory);
    const message = await readFile(
      path.join(emailDirectory, messageFile),
      "utf8",
    );
    const encodedUrl = message.match(
      /href="([^"]*\/verify-email\?token=[^"]+)"/,
    )?.[1];
    expect(encodedUrl).toBeTruthy();
    const token = new URL(
      encodedUrl!.replaceAll("&amp;", "&"),
    ).searchParams.get("token");
    expect(token).toBeTruthy();
    expect(storedToken?.digest).not.toBe(token);

    await verifyEmailToken(token!, {
      ...context,
      requestId: "integration-verification",
    });
    const user = await UserModel.findOne({
      email: testEmail,
    }).select("+passwordHash");
    expect(user?.emailVerified).toBeInstanceOf(Date);
    expect(
      await argon2.verify(user!.passwordHash!, "Strong-Integration-42!"),
    ).toBe(true);
    await expect(verifyEmailToken(token!, context)).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("creates tenant roles and owner membership atomically", async () => {
    const { createOrganization, listOrganizations } =
      await import("../../src/features/organizations/service");
    const { RoleModel, UserModel } = await import("../../src/server/db/models");
    const user = await UserModel.findOne({ email: testEmail });
    const authorizedUser = {
      id: user!._id.toString(),
      email: user!.email,
      sessionId: "integration-session",
      tokenVersion: user!.tokenVersion,
    };
    const organization = await createOrganization(
      { name: "Integration Organization" },
      authorizedUser,
      {
        requestId: "integration-organization",
        ipHash: "test-ip",
        userAgent: "vitest",
      },
    );

    expect(
      await RoleModel.countDocuments({ organizationId: organization.id }),
    ).toBe(5);
    const organizations = await listOrganizations(authorizedUser.id);
    expect(organizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: organization.id,
          role: expect.objectContaining({ key: "owner" }),
        }),
      ]),
    );
  });
});
