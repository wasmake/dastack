import {
  model,
  models,
  Schema,
  Types,
  type InferSchemaType,
  type Model,
} from "mongoose";

const objectId = Schema.Types.ObjectId;

const userSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 320,
    },
    emailVerified: { type: Date, default: null },
    image: { type: String, default: null, maxlength: 2048 },
    passwordHash: { type: String, default: null, select: false },
    status: {
      type: String,
      enum: ["active", "suspended", "deleted"],
      default: "active",
      required: true,
    },
    termsAcceptedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0, min: 0, required: true },
    deletedAt: { type: Date, default: null },
  },
  { collection: "users", timestamps: true, optimisticConcurrency: true },
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ status: 1, deletedAt: 1 });

const accountSchema = new Schema(
  {
    userId: { type: objectId, required: true, ref: "User" },
    type: { type: String, required: true },
    provider: { type: String, required: true },
    providerAccountId: { type: String, required: true },
    refresh_token: { type: String },
    access_token: { type: String },
    expires_at: { type: Number },
    token_type: { type: String },
    scope: { type: String },
    id_token: { type: String },
    session_state: { type: String },
  },
  { collection: "accounts", timestamps: true, optimisticConcurrency: true },
);
accountSchema.index({ provider: 1, providerAccountId: 1 }, { unique: true });
accountSchema.index({ userId: 1 });

const sessionSchema = new Schema(
  {
    sessionToken: { type: String, required: true },
    userId: { type: objectId, required: true, ref: "User" },
    expires: { type: Date, required: true },
  },
  { collection: "sessions", timestamps: true, optimisticConcurrency: true },
);
sessionSchema.index({ sessionToken: 1 }, { unique: true });
sessionSchema.index({ userId: 1 });
sessionSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });

const verificationTokenSchema = new Schema(
  {
    identifier: { type: String, required: true, lowercase: true, trim: true },
    token: { type: String, required: true },
    expires: { type: Date, required: true },
  },
  { collection: "verification_tokens", versionKey: false },
);
verificationTokenSchema.index({ identifier: 1, token: 1 }, { unique: true });
verificationTokenSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });

const appSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true },
    userId: { type: objectId, required: true, ref: "User" },
    tokenVersion: { type: Number, required: true, min: 0 },
    provider: { type: String, required: true, maxlength: 64 },
    ipHash: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 512 },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null, maxlength: 64 },
  },
  { collection: "app_sessions", timestamps: true, optimisticConcurrency: true },
);
appSessionSchema.index({ sessionId: 1 }, { unique: true });
appSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: -1 });
appSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const authTokenSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["verify_email", "reset_password", "invitation"],
      required: true,
    },
    digest: { type: String, required: true },
    identifier: { type: String, required: true, lowercase: true, trim: true },
    userId: { type: objectId, ref: "User", default: null },
    organizationId: { type: objectId, ref: "Organization", default: null },
    invitationId: { type: objectId, ref: "Invitation", default: null },
    createdBy: { type: objectId, ref: "User", default: null },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { collection: "auth_tokens", timestamps: true, optimisticConcurrency: true },
);
authTokenSchema.index({ digest: 1 }, { unique: true });
authTokenSchema.index({ identifier: 1, type: 1, usedAt: 1, createdAt: -1 });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const organizationSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 80,
    },
    status: {
      type: String,
      enum: ["active", "suspended", "deleted"],
      default: "active",
      required: true,
    },
    createdBy: { type: objectId, required: true, ref: "User" },
    updatedBy: { type: objectId, required: true, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: "organizations",
    timestamps: true,
    optimisticConcurrency: true,
  },
);
organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ status: 1, deletedAt: 1 });

const roleSchema = new Schema(
  {
    organizationId: { type: objectId, required: true, ref: "Organization" },
    key: {
      type: String,
      enum: ["owner", "admin", "developer", "billing", "viewer"],
      required: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    permissions: [{ type: String, required: true }],
    isSystem: { type: Boolean, default: true, required: true },
    createdBy: { type: objectId, required: true, ref: "User" },
    updatedBy: { type: objectId, required: true, ref: "User" },
  },
  { collection: "roles", timestamps: true, optimisticConcurrency: true },
);
roleSchema.index({ organizationId: 1, key: 1 }, { unique: true });
roleSchema.index({ organizationId: 1, name: 1 });

const organizationMemberSchema = new Schema(
  {
    organizationId: { type: objectId, required: true, ref: "Organization" },
    userId: { type: objectId, required: true, ref: "User" },
    roleId: { type: objectId, required: true, ref: "Role" },
    status: {
      type: String,
      enum: ["active", "suspended", "removed"],
      default: "active",
      required: true,
    },
    invitedBy: { type: objectId, ref: "User", default: null },
    joinedAt: { type: Date, required: true },
    updatedBy: { type: objectId, required: true, ref: "User" },
    removedAt: { type: Date, default: null },
  },
  {
    collection: "organization_members",
    timestamps: true,
    optimisticConcurrency: true,
  },
);
organizationMemberSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true },
);
organizationMemberSchema.index({ userId: 1, status: 1 });
organizationMemberSchema.index({ organizationId: 1, roleId: 1, status: 1 });

const invitationSchema = new Schema(
  {
    organizationId: { type: objectId, required: true, ref: "Organization" },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 320,
    },
    roleId: { type: objectId, required: true, ref: "Role" },
    status: {
      type: String,
      enum: ["pending", "accepted", "revoked", "expired"],
      default: "pending",
      required: true,
    },
    invitedBy: { type: objectId, required: true, ref: "User" },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    acceptedBy: { type: objectId, ref: "User", default: null },
    revokedAt: { type: Date, default: null },
  },
  { collection: "invitations", timestamps: true, optimisticConcurrency: true },
);
invitationSchema.index(
  { organizationId: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);
invitationSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
invitationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 },
);

const auditLogSchema = new Schema(
  {
    organizationId: { type: objectId, ref: "Organization", default: null },
    actorUserId: { type: objectId, ref: "User", default: null },
    action: { type: String, required: true, maxlength: 120 },
    targetType: { type: String, required: true, maxlength: 80 },
    targetId: { type: String, default: null, maxlength: 120 },
    requestId: { type: String, required: true, maxlength: 80 },
    ipHash: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, immutable: true },
  },
  { collection: "audit_logs", versionKey: false },
);
auditLogSchema.index({ organizationId: 1, createdAt: -1 });
auditLogSchema.index({ actorUserId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const emailDeliverySchema = new Schema(
  {
    organizationId: { type: objectId, ref: "Organization", default: null },
    userId: { type: objectId, ref: "User", default: null },
    template: { type: String, required: true, maxlength: 80 },
    recipientDigest: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
      required: true,
    },
    attempts: { type: Number, default: 0, min: 0, required: true },
    provider: { type: String, required: true, enum: ["resend", "file"] },
    providerId: { type: String, default: null, maxlength: 255 },
    errorCode: { type: String, default: null, maxlength: 80 },
    lastAttemptAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
  },
  {
    collection: "email_deliveries",
    timestamps: true,
    optimisticConcurrency: true,
  },
);
emailDeliverySchema.index({ status: 1, updatedAt: 1 });
emailDeliverySchema.index({ recipientDigest: 1, createdAt: -1 });
emailDeliverySchema.index({ organizationId: 1, createdAt: -1 });

function existingModel<T>(name: string): Model<T> | undefined {
  return models[name] as Model<T> | undefined;
}

export type UserDocument = InferSchemaType<typeof userSchema>;
export type AccountDocument = InferSchemaType<typeof accountSchema>;
export type AppSessionDocument = InferSchemaType<typeof appSessionSchema>;
export type AuthTokenDocument = InferSchemaType<typeof authTokenSchema>;
export type OrganizationDocument = InferSchemaType<typeof organizationSchema>;
export type OrganizationMemberDocument = InferSchemaType<
  typeof organizationMemberSchema
>;
export type RoleDocument = InferSchemaType<typeof roleSchema>;
export type InvitationDocument = InferSchemaType<typeof invitationSchema>;

export type SessionDocument = InferSchemaType<typeof sessionSchema>;
export type VerificationTokenDocument = InferSchemaType<
  typeof verificationTokenSchema
>;
export type AuditLogDocument = InferSchemaType<typeof auditLogSchema>;
export type EmailDeliveryDocument = InferSchemaType<typeof emailDeliverySchema>;

export const UserModel: Model<UserDocument> =
  existingModel<UserDocument>("User") ??
  model<UserDocument>("User", userSchema);
export const AccountModel: Model<AccountDocument> =
  existingModel<AccountDocument>("Account") ??
  model<AccountDocument>("Account", accountSchema);
export const SessionModel: Model<SessionDocument> =
  existingModel<SessionDocument>("Session") ??
  model<SessionDocument>("Session", sessionSchema);
export const VerificationTokenModel: Model<VerificationTokenDocument> =
  existingModel<VerificationTokenDocument>("VerificationToken") ??
  model<VerificationTokenDocument>(
    "VerificationToken",
    verificationTokenSchema,
  );
export const AppSessionModel: Model<AppSessionDocument> =
  existingModel<AppSessionDocument>("AppSession") ??
  model<AppSessionDocument>("AppSession", appSessionSchema);
export const AuthTokenModel: Model<AuthTokenDocument> =
  existingModel<AuthTokenDocument>("AuthToken") ??
  model<AuthTokenDocument>("AuthToken", authTokenSchema);
export const OrganizationModel: Model<OrganizationDocument> =
  existingModel<OrganizationDocument>("Organization") ??
  model<OrganizationDocument>("Organization", organizationSchema);
export const OrganizationMemberModel: Model<OrganizationMemberDocument> =
  existingModel<OrganizationMemberDocument>("OrganizationMember") ??
  model<OrganizationMemberDocument>(
    "OrganizationMember",
    organizationMemberSchema,
  );
export const RoleModel: Model<RoleDocument> =
  existingModel<RoleDocument>("Role") ??
  model<RoleDocument>("Role", roleSchema);
export const InvitationModel: Model<InvitationDocument> =
  existingModel<InvitationDocument>("Invitation") ??
  model<InvitationDocument>("Invitation", invitationSchema);
export const AuditLogModel: Model<AuditLogDocument> =
  existingModel<AuditLogDocument>("AuditLog") ??
  model<AuditLogDocument>("AuditLog", auditLogSchema);
export const EmailDeliveryModel: Model<EmailDeliveryDocument> =
  existingModel<EmailDeliveryDocument>("EmailDelivery") ??
  model<EmailDeliveryDocument>("EmailDelivery", emailDeliverySchema);

export { Types };
