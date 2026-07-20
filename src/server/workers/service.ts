import { createHash, randomBytes, randomUUID } from "node:crypto";

import { Types, type ClientSession } from "mongoose";

import { PERMISSIONS } from "@/features/organizations/permissions";
import { readBody } from "@/server/api";
import { writeAudit } from "@/server/audit";
import { requireOrganizationPermission } from "@/server/authorization";
import {
  IdempotencyRecordModel,
  WorkerCredentialModel,
  WorkerNodeModel,
  type WorkerCredentialRecord,
} from "@/server/db/control-plane-models";
import { connectMongoose } from "@/server/db/mongodb";
import { runTransaction } from "@/server/domain/transactions";
import { AppError } from "@/server/security/errors";
import type { RequestContext } from "@/server/security/request";
import {
  getWorkerEnrollmentConfig,
  getWorkerPersistenceConfig,
  getWorkerSecurityConfig,
} from "@/server/workers/env";
import {
  importEd25519PublicKey,
  matchesSha256Hex,
  readWorkerSignatureHeaders,
  sha256Base64Url,
  verifyCredentialRotationProof,
  verifyWorkerRequest,
  WorkerProtocolError,
  type WorkerCredentialForVerification,
} from "@/server/workers/protocol";
import {
  workerCredentialRotationSchema,
  workerCredentialRotationChallengeSchema,
  workerEnrollmentSchema,
  workerHeartbeatSchema,
  workerResultSchema,
  type WorkerCredentialRotation,
  type WorkerCredentialRotationChallenge,
  type WorkerEnrollment,
  type WorkerHeartbeat,
  type WorkerResult,
} from "@/server/workers/schemas";

const MAX_SIGNED_BODY_BYTES = 32 * 1_024;

type CredentialWithPublicKey = WorkerCredentialRecord & {
  publicKey: string;
};

export type AuthenticatedWorkerPayload<T> = {
  credential: WorkerCredentialForVerification;
  payload: T;
  bodyDigest: string;
};

export function assertSecureWorkerTransport(request: Request): void {
  const config = getWorkerSecurityConfig();
  const url = new URL(request.url);
  const forwardedHttps =
    process.env.TRUST_PROXY === "true" &&
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  if (url.protocol === "https:" || forwardedHttps) return;
  if (config.NODE_ENV !== "production" && config.WORKER_ALLOW_INSECURE_HTTP) {
    return;
  }
  throw new AppError(
    400,
    "WORKER_HTTPS_REQUIRED",
    "Worker endpoints require HTTPS.",
  );
}

export function readEnrollmentToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~+/=-]{24,512})$/.exec(authorization);
  if (!match) {
    throw new AppError(
      401,
      "WORKER_ENROLLMENT_REJECTED",
      "Worker enrollment was rejected.",
    );
  }
  return match[1];
}

export async function enrollWorker(
  rawInput: unknown,
  enrollmentToken: string,
  context: RequestContext,
): Promise<{ workerId: string; keyId: string; expiresAt: Date }> {
  const input = workerEnrollmentSchema.parse(rawInput);
  validatePublicKey(input.publicKey.value);
  const enrollmentConfig = getWorkerEnrollmentConfig();
  if (
    !matchesSha256Hex(
      enrollmentToken,
      enrollmentConfig.WORKER_ENROLLMENT_TOKEN_DIGEST,
    )
  ) {
    throw new AppError(
      401,
      "WORKER_ENROLLMENT_REJECTED",
      "Worker enrollment was rejected.",
    );
  }

  await connectMongoose();
  const securityConfig = getWorkerSecurityConfig();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + securityConfig.WORKER_CREDENTIAL_TTL_SECONDS * 1_000,
  );
  const tokenDigest = createHash("sha256")
    .update(enrollmentToken, "utf8")
    .digest("hex");
  const enrollmentRequestHash = createHash("sha256")
    .update(`${tokenDigest}\n${JSON.stringify(input)}`, "utf8")
    .digest("hex");
  const keyId = `wk_${randomBytes(18).toString("base64url")}`;
  const providerNodeId = `node_${randomUUID().replaceAll("-", "")}`;

  let result: { workerId: string; keyId: string; expiresAt: Date };
  try {
    result = await runTransaction(async (session) => {
      await consumeEnrollmentToken(tokenDigest, enrollmentRequestHash, session);
      const capacity = toWorkerCapacity(input.totalCapacity);
      const worker = (
        await WorkerNodeModel.create(
          [
            {
              providerNodeId,
              name: input.name,
              region: input.region,
              status: "online",
              schedulable: true,
              capacity,
              reserved: zeroWorkerCapacity(),
              allocated: zeroWorkerCapacity(),
              reportedAllocated: zeroWorkerCapacity(),
              provider: input.provider,
              runtime: {
                phase: input.agent.phase,
                platform: input.agent.platform,
                architecture: input.agent.architecture,
                nodeVersion: input.agent.nodeVersion,
                hostname: input.name,
                managedRuntime: "none",
                uptimeSeconds: 0,
              },
              hostUsage: {
                loadAverage1m: 0,
                memoryUsedBytes: 0,
                diskUsedBytes: 0,
              },
              labels: enrollmentLabels(input),
              lastHeartbeatAt: now,
              createdBy: enrollmentConfig.WORKER_SYSTEM_ACTOR_ID,
              updatedBy: enrollmentConfig.WORKER_SYSTEM_ACTOR_ID,
            },
          ],
          { session },
        )
      )[0];
      await WorkerCredentialModel.create(
        [
          {
            workerId: worker._id,
            keyId,
            publicKey: input.publicKey.value,
            status: "active",
            expiresAt,
            lastUsedAt: null,
            createdBy: enrollmentConfig.WORKER_SYSTEM_ACTOR_ID,
            updatedBy: enrollmentConfig.WORKER_SYSTEM_ACTOR_ID,
          },
        ],
        { session },
      );
      await IdempotencyRecordModel.updateOne(
        {
          organizationId: enrollmentConfig.WORKER_SYSTEM_ORGANIZATION_ID,
          scope: "worker-enrollment",
          key: tokenDigest,
        },
        {
          $set: {
            resourceId: worker._id.toString(),
            status: "completed",
            updatedBy: enrollmentConfig.WORKER_SYSTEM_ACTOR_ID,
          },
        },
        { session },
      );
      await writeAudit(
        {
          organizationId: enrollmentConfig.WORKER_SYSTEM_ORGANIZATION_ID,
          actorUserId: enrollmentConfig.WORKER_SYSTEM_ACTOR_ID,
          action: "worker.enrolled",
          targetType: "worker_node",
          targetId: worker._id.toString(),
          requestId: context.requestId,
          ipHash: context.ipHash,
          metadata: {
            name: input.name,
            region: input.region,
            provider: input.provider.name,
            credentialExpiresAt: expiresAt.toISOString(),
          },
        },
        session,
      );
      return { workerId: worker._id.toString(), keyId, expiresAt };
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const replay = await findEnrollmentReplay(
        tokenDigest,
        enrollmentRequestHash,
        input.publicKey.value,
      );
      if (replay) return replay;
      throw new AppError(
        401,
        "WORKER_ENROLLMENT_REJECTED",
        "Worker enrollment was rejected.",
      );
    }
    throw error;
  }

  return result;
}

export async function listWorkerNodes(organizationId: string, userId: string) {
  await requireOrganizationPermission(
    userId,
    organizationId,
    PERMISSIONS.ENVIRONMENT_MANAGE,
  );
  const workers = await WorkerNodeModel.find({ status: { $ne: "disabled" } })
    .sort({ region: 1, name: 1, _id: 1 })
    .lean();
  return workers.map((worker) => ({
    id: worker._id.toString(),
    providerNodeId: worker.providerNodeId,
    name: worker.name,
    region: worker.region,
    status: worker.status,
    schedulable: worker.schedulable,
    capacity: worker.capacity,
    reserved: worker.reserved,
    allocated: worker.allocated,
    reportedAllocated: worker.reportedAllocated,
    available: Object.fromEntries(
      Object.keys(worker.capacity).map((key) => [
        key,
        Math.max(
          0,
          worker.capacity[key as keyof typeof worker.capacity] -
            worker.reserved[key as keyof typeof worker.reserved] -
            worker.allocated[key as keyof typeof worker.allocated],
        ),
      ]),
    ),
    provider: worker.provider,
    runtime: worker.runtime,
    hostUsage: worker.hostUsage,
    lastHeartbeatAt: worker.lastHeartbeatAt,
    updatedAt: worker.updatedAt,
  }));
}

export async function authenticateHeartbeat(
  request: Request,
): Promise<AuthenticatedWorkerPayload<WorkerHeartbeat>> {
  return authenticateSignedJson(request, workerHeartbeatSchema.parse);
}

export async function persistHeartbeat(
  authenticated: AuthenticatedWorkerPayload<WorkerHeartbeat>,
  context: RequestContext,
): Promise<{ workerId: string; acceptedAt: Date }> {
  const { credential, payload } = authenticated;
  const now = new Date();
  if (Math.abs(now.getTime() - Date.parse(payload.observedAt)) > 5 * 60_000) {
    throw new AppError(
      400,
      "STALE_HEARTBEAT",
      "The heartbeat observation time is outside the accepted window.",
    );
  }
  const persistence = getWorkerPersistenceConfig();
  const status = payload.status === "draining" ? "draining" : "online";
  await runTransaction(async (session) => {
    const worker = await WorkerNodeModel.findOneAndUpdate(
      { _id: credential.workerId, status: { $ne: "disabled" } },
      {
        $set: {
          status,
          schedulable: payload.status === "ready",
          capacity: toWorkerCapacity(payload.capacity),
          reportedAllocated: toWorkerCapacity(payload.allocated),
          runtime: payload.runtime,
          hostUsage: payload.hostUsage,
          lastHeartbeatAt: now,
          updatedBy: persistence.WORKER_SYSTEM_ACTOR_ID,
          "labels.agentPhase": payload.runtime.phase,
          "labels.agentPlatform": payload.runtime.platform,
          "labels.agentArchitecture": payload.runtime.architecture,
          "labels.agentNodeVersion": payload.runtime.nodeVersion,
          "labels.agentHostname": payload.runtime.hostname,
          "labels.agentManagedRuntime": payload.runtime.managedRuntime,
          "labels.agentUptimeSeconds": String(payload.runtime.uptimeSeconds),
          "labels.hostLoadAverage1m": String(payload.hostUsage.loadAverage1m),
          "labels.hostMemoryUsedBytes": String(
            payload.hostUsage.memoryUsedBytes,
          ),
          "labels.hostDiskUsedBytes": String(payload.hostUsage.diskUsedBytes),
          "labels.heartbeatHealth": payload.status,
        },
      },
      { returnDocument: "after", session },
    );
    if (!worker) {
      throw new AppError(
        403,
        "WORKER_DISABLED",
        "The worker is not permitted to report heartbeats.",
      );
    }
    await WorkerCredentialModel.updateOne(
      { keyId: credential.keyId, status: "active" },
      {
        $set: {
          lastUsedAt: now,
          updatedBy: persistence.WORKER_SYSTEM_ACTOR_ID,
        },
      },
      { session },
    );
    await writeAudit(
      {
        organizationId: persistence.WORKER_SYSTEM_ORGANIZATION_ID,
        actorUserId: persistence.WORKER_SYSTEM_ACTOR_ID,
        action: "worker.heartbeat_received",
        targetType: "worker_node",
        targetId: credential.workerId,
        requestId: context.requestId,
        ipHash: context.ipHash,
        metadata: { status: payload.status, observedAt: payload.observedAt },
      },
      session,
    );
  });
  return { workerId: credential.workerId, acceptedAt: now };
}

export async function authenticateWorkerResult(
  request: Request,
): Promise<AuthenticatedWorkerPayload<WorkerResult>> {
  return authenticateSignedJson(request, workerResultSchema.parse);
}

export async function persistWorkerResult(
  authenticated: AuthenticatedWorkerPayload<WorkerResult>,
  context: RequestContext,
): Promise<{ commandId: string; outcome: WorkerResult["outcome"] }> {
  const { credential, payload, bodyDigest } = authenticated;
  const persistence = getWorkerPersistenceConfig();
  await connectMongoose();
  const requestHash = createHash("sha256").update(bodyDigest).digest("hex");
  const completedAt = new Date(payload.completedAt);
  const existingResult = await IdempotencyRecordModel.findOne({
    organizationId: persistence.WORKER_SYSTEM_ORGANIZATION_ID,
    scope: "worker-command-result",
    key: payload.commandId,
  }).lean();
  if (existingResult) {
    assertMatchingWorkerResult(
      existingResult,
      requestHash,
      authenticated.credential.workerId,
    );
    return { commandId: payload.commandId, outcome: payload.outcome };
  }
  try {
    await runTransaction(async (session) => {
      const concurrent = await IdempotencyRecordModel.findOne({
        organizationId: persistence.WORKER_SYSTEM_ORGANIZATION_ID,
        scope: "worker-command-result",
        key: payload.commandId,
      })
        .session(session)
        .lean();
      if (concurrent) {
        assertMatchingWorkerResult(
          concurrent,
          requestHash,
          authenticated.credential.workerId,
        );
        return;
      }
      if (Math.abs(Date.now() - completedAt.getTime()) > 5 * 60_000) {
        throw new AppError(
          400,
          "INVALID_COMPLETION_TIME",
          "The command completion time is outside the accepted window.",
        );
      }
      const command = await IdempotencyRecordModel.findOne({
        organizationId: persistence.WORKER_SYSTEM_ORGANIZATION_ID,
        scope: "worker-command",
        key: payload.commandId,
        resourceType: "worker_command",
        resourceId: credential.workerId,
        status: "started",
        createdAt: { $lte: completedAt },
        expiresAt: { $gte: completedAt },
      }).session(session);
      if (!command) {
        throw new AppError(
          404,
          "WORKER_COMMAND_NOT_FOUND",
          "The worker command was not found.",
        );
      }
      await IdempotencyRecordModel.create(
        [
          {
            organizationId: persistence.WORKER_SYSTEM_ORGANIZATION_ID,
            scope: "worker-command-result",
            key: payload.commandId,
            requestHash,
            resourceType: "worker_command_result",
            resourceId: credential.workerId,
            status: payload.outcome === "succeeded" ? "completed" : "failed",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
            createdBy: persistence.WORKER_SYSTEM_ACTOR_ID,
            updatedBy: persistence.WORKER_SYSTEM_ACTOR_ID,
          },
        ],
        { session },
      );
      command.status = payload.outcome === "succeeded" ? "completed" : "failed";
      command.updatedBy = new Types.ObjectId(
        persistence.WORKER_SYSTEM_ACTOR_ID,
      );
      await command.save({ session });
      await writeAudit(
        {
          organizationId: persistence.WORKER_SYSTEM_ORGANIZATION_ID,
          actorUserId: persistence.WORKER_SYSTEM_ACTOR_ID,
          action: "worker.command_result_received",
          targetType: "worker_command",
          targetId: payload.commandId,
          requestId: context.requestId,
          ipHash: context.ipHash,
          metadata: {
            workerId: credential.workerId,
            outcome: payload.outcome,
            errorCode: payload.errorCode,
          },
        },
        session,
      );
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const concurrent = await IdempotencyRecordModel.findOne({
      organizationId: persistence.WORKER_SYSTEM_ORGANIZATION_ID,
      scope: "worker-command-result",
      key: payload.commandId,
    }).lean();
    if (!concurrent) throw error;
    assertMatchingWorkerResult(concurrent, requestHash, credential.workerId);
  }

  return { commandId: payload.commandId, outcome: payload.outcome };
}

function assertMatchingWorkerResult(
  result: { requestHash: string; resourceId: string | null },
  requestHash: string,
  workerId: string,
): void {
  if (result.requestHash !== requestHash || result.resourceId !== workerId) {
    throw new AppError(
      409,
      "WORKER_RESULT_CONFLICT",
      "A different worker result was already recorded for this command.",
    );
  }
}

export async function authenticateCredentialRotation(
  request: Request,
): Promise<AuthenticatedWorkerPayload<WorkerCredentialRotation>> {
  return authenticateSignedJson(
    request,
    workerCredentialRotationSchema.parse,
    true,
  );
}

export async function authenticateCredentialRotationChallenge(
  request: Request,
): Promise<AuthenticatedWorkerPayload<WorkerCredentialRotationChallenge>> {
  return authenticateSignedJson(
    request,
    workerCredentialRotationChallengeSchema.parse,
  );
}

export async function createCredentialRotationChallenge(
  authenticated: AuthenticatedWorkerPayload<WorkerCredentialRotationChallenge>,
): Promise<{ challengeId: string; challenge: string; expiresAt: Date }> {
  const persistence = getWorkerPersistenceConfig();
  const challengeId = `rc_${randomBytes(18).toString("base64url")}`;
  const challenge = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  await IdempotencyRecordModel.create({
    organizationId: persistence.WORKER_SYSTEM_ORGANIZATION_ID,
    scope: "worker-credential-rotation",
    key: challengeId,
    requestHash: createHash("sha256").update(challenge).digest("hex"),
    resourceType: "worker_node",
    resourceId: authenticated.credential.workerId,
    status: "started",
    expiresAt,
    createdBy: persistence.WORKER_SYSTEM_ACTOR_ID,
    updatedBy: persistence.WORKER_SYSTEM_ACTOR_ID,
  });
  return { challengeId, challenge, expiresAt };
}

export async function rotateWorkerCredential(
  authenticated: AuthenticatedWorkerPayload<WorkerCredentialRotation>,
  context: RequestContext,
): Promise<{ keyId: string; expiresAt: Date }> {
  validatePublicKey(authenticated.payload.publicKey.value);
  const persistence = getWorkerPersistenceConfig();
  const security = getWorkerSecurityConfig();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + security.WORKER_CREDENTIAL_TTL_SECONDS * 1_000,
  );
  const rotationRequestHash = createHash("sha256")
    .update(
      [
        authenticated.payload.challengeId,
        authenticated.payload.publicKey.value,
        authenticated.payload.proof,
      ].join("\n"),
      "utf8",
    )
    .digest("hex");

  const challenge = await IdempotencyRecordModel.findOne({
    organizationId: persistence.WORKER_SYSTEM_ORGANIZATION_ID,
    scope: "worker-credential-rotation",
    key: authenticated.payload.challengeId,
    resourceType: "worker_node",
    resourceId: authenticated.credential.workerId,
    status: { $in: ["started", "completed"] },
    expiresAt: { $gt: now },
  }).lean();
  if (
    !challenge ||
    !matchesSha256Hex(authenticated.payload.challenge, challenge.requestHash) ||
    !verifyCredentialRotationProof({
      workerId: authenticated.credential.workerId,
      challengeId: authenticated.payload.challengeId,
      challenge: authenticated.payload.challenge,
      publicKey: authenticated.payload.publicKey.value,
      proof: authenticated.payload.proof,
    })
  ) {
    throw new AppError(
      401,
      "WORKER_ROTATION_PROOF_REJECTED",
      "The credential rotation proof was rejected.",
    );
  }
  if (challenge.status === "completed") {
    return readRotationResult(challenge.result, rotationRequestHash);
  }
  const keyId = `wk_${randomBytes(18).toString("base64url")}`;

  return runTransaction(async (session) => {
    const currentChallenge = await IdempotencyRecordModel.findOne({
      _id: challenge._id,
      expiresAt: { $gt: now },
    }).session(session);
    if (!currentChallenge) {
      throw new AppError(
        409,
        "WORKER_ROTATION_CHALLENGE_USED",
        "The credential rotation challenge is no longer active.",
      );
    }
    if (currentChallenge.status === "completed") {
      return readRotationResult(currentChallenge.result, rotationRequestHash);
    }
    if (currentChallenge.status !== "started") {
      throw new AppError(
        409,
        "WORKER_ROTATION_CHALLENGE_USED",
        "The credential rotation challenge is no longer active.",
      );
    }
    const previousCredential = await WorkerCredentialModel.findOneAndUpdate(
      {
        keyId: authenticated.credential.keyId,
        workerId: authenticated.credential.workerId,
        status: "active",
      },
      {
        $set: {
          status: "rotating",
          updatedBy: persistence.WORKER_SYSTEM_ACTOR_ID,
        },
      },
      { session, returnDocument: "after" },
    );
    if (!previousCredential) {
      throw new AppError(
        409,
        "WORKER_CREDENTIAL_CHANGED",
        "The worker credential changed before it could be rotated.",
      );
    }
    await WorkerCredentialModel.create(
      [
        {
          workerId: authenticated.credential.workerId,
          keyId,
          publicKey: authenticated.payload.publicKey.value,
          status: "active",
          expiresAt,
          createdBy: persistence.WORKER_SYSTEM_ACTOR_ID,
          updatedBy: persistence.WORKER_SYSTEM_ACTOR_ID,
        },
      ],
      { session },
    );
    currentChallenge.status = "completed";
    currentChallenge.result = {
      requestHash: rotationRequestHash,
      keyId,
      expiresAt: expiresAt.toISOString(),
    };
    currentChallenge.expiresAt = new Date(Date.now() + 5 * 60_000);
    currentChallenge.updatedBy = new Types.ObjectId(
      persistence.WORKER_SYSTEM_ACTOR_ID,
    );
    await currentChallenge.save({ session });
    await writeAudit(
      {
        organizationId: persistence.WORKER_SYSTEM_ORGANIZATION_ID,
        actorUserId: persistence.WORKER_SYSTEM_ACTOR_ID,
        action: "worker.credential_rotated",
        targetType: "worker_node",
        targetId: authenticated.credential.workerId,
        requestId: context.requestId,
        ipHash: context.ipHash,
        metadata: {
          previousKeyId: authenticated.credential.keyId,
          keyId,
          expiresAt,
        },
      },
      session,
    );
    return { keyId, expiresAt };
  });
}

function readRotationResult(
  rawResult: Record<string, unknown> | null,
  requestHash: string,
): { keyId: string; expiresAt: Date } {
  if (
    !rawResult ||
    rawResult.requestHash !== requestHash ||
    typeof rawResult.keyId !== "string" ||
    !/^wk_[A-Za-z0-9_-]{12,80}$/.test(rawResult.keyId) ||
    typeof rawResult.expiresAt !== "string"
  ) {
    throw new AppError(
      409,
      "WORKER_ROTATION_CHALLENGE_USED",
      "The credential rotation challenge was used by another request.",
    );
  }
  const expiresAt = new Date(rawResult.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error("Stored worker rotation result is invalid.");
  }
  return { keyId: rawResult.keyId, expiresAt };
}

async function authenticateSignedJson<T>(
  request: Request,
  parse: (value: unknown) => T,
  allowRotatingCredential = false,
): Promise<AuthenticatedWorkerPayload<T>> {
  assertSecureWorkerTransport(request);
  if (
    request.headers.get("content-type")?.split(";", 1)[0] !== "application/json"
  ) {
    throw new AppError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Worker requests require application/json.",
    );
  }
  const body = await readBody(request, MAX_SIGNED_BODY_BYTES);
  const headers = readWorkerSignatureHeaders(request.headers);
  const url = new URL(request.url);
  const config = getWorkerSecurityConfig();
  let credential: WorkerCredentialForVerification;
  try {
    credential = await verifyWorkerRequest(
      {
        method: request.method,
        pathname: url.pathname,
        body,
        ...headers,
      },
      {
        maxClockSkewMs: config.WORKER_REQUEST_MAX_SKEW_SECONDS * 1_000,
        nonceTtlMs: config.WORKER_NONCE_TTL_SECONDS * 1_000,
        findCredential: (keyId) =>
          findCredential(keyId, allowRotatingCredential),
        consumeNonce,
      },
    );
  } catch (error) {
    if (error instanceof WorkerProtocolError) {
      throw new AppError(
        401,
        "WORKER_AUTHENTICATION_FAILED",
        "Worker request authentication failed.",
      );
    }
    throw error;
  }

  const persistence = getWorkerPersistenceConfig();
  await WorkerCredentialModel.updateMany(
    {
      workerId: credential.workerId,
      keyId: { $ne: credential.keyId },
      status: "rotating",
    },
    {
      $set: {
        status: "revoked",
        revokedAt: new Date(),
        revokedBy: persistence.WORKER_SYSTEM_ACTOR_ID,
        updatedBy: persistence.WORKER_SYSTEM_ACTOR_ID,
      },
    },
  );

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body).toString("utf8"));
  } catch {
    throw new AppError(
      400,
      "INVALID_JSON",
      "The request body must be valid JSON.",
    );
  }
  return {
    credential,
    payload: parse(decoded),
    bodyDigest: sha256Base64Url(body),
  };
}

async function findCredential(
  keyId: string,
  allowRotating = false,
): Promise<WorkerCredentialForVerification | null> {
  await connectMongoose();
  const credential = await WorkerCredentialModel.findOne({ keyId })
    .select("+publicKey")
    .lean<CredentialWithPublicKey>();
  if (!credential) return null;
  return {
    workerId: credential.workerId.toString(),
    keyId: credential.keyId,
    publicKey: credential.publicKey,
    status:
      credential.status === "active" ||
      (allowRotating && credential.status === "rotating")
        ? "active"
        : "revoked",
    expiresAt: credential.expiresAt,
  };
}

async function consumeNonce(input: {
  workerId: string;
  keyId: string;
  nonce: string;
  expiresAt: Date;
}): Promise<boolean> {
  const persistence = getWorkerPersistenceConfig();
  const requestHash = createHash("sha256")
    .update(`${input.keyId}\n${input.nonce}`, "utf8")
    .digest("hex");
  try {
    await IdempotencyRecordModel.create({
      organizationId: persistence.WORKER_SYSTEM_ORGANIZATION_ID,
      scope: "worker-request-nonce",
      key: `${input.keyId}.${input.nonce}`,
      requestHash,
      resourceType: "worker_node",
      resourceId: input.workerId,
      status: "completed",
      expiresAt: input.expiresAt,
      createdBy: persistence.WORKER_SYSTEM_ACTOR_ID,
      updatedBy: persistence.WORKER_SYSTEM_ACTOR_ID,
    });
    return true;
  } catch (error) {
    if (isDuplicateKey(error)) return false;
    throw error;
  }
}

async function consumeEnrollmentToken(
  tokenDigest: string,
  requestHash: string,
  session: ClientSession,
): Promise<void> {
  const config = getWorkerEnrollmentConfig();
  await IdempotencyRecordModel.create(
    [
      {
        organizationId: config.WORKER_SYSTEM_ORGANIZATION_ID,
        scope: "worker-enrollment",
        key: tokenDigest,
        requestHash,
        resourceType: "worker_node",
        resourceId: null,
        status: "started",
        expiresAt: new Date("9999-12-31T23:59:59.999Z"),
        createdBy: config.WORKER_SYSTEM_ACTOR_ID,
        updatedBy: config.WORKER_SYSTEM_ACTOR_ID,
      },
    ],
    { session },
  );
}

async function findEnrollmentReplay(
  tokenDigest: string,
  requestHash: string,
  publicKey: string,
): Promise<{ workerId: string; keyId: string; expiresAt: Date } | null> {
  const config = getWorkerEnrollmentConfig();
  const enrollment = await IdempotencyRecordModel.findOne({
    organizationId: config.WORKER_SYSTEM_ORGANIZATION_ID,
    scope: "worker-enrollment",
    key: tokenDigest,
    requestHash,
    status: "completed",
    resourceId: { $ne: null },
  }).lean();
  if (!enrollment?.resourceId) return null;
  const credential = await WorkerCredentialModel.findOne({
    workerId: enrollment.resourceId,
    status: "active",
    expiresAt: { $gt: new Date() },
  })
    .select("+publicKey")
    .lean<CredentialWithPublicKey>();
  if (!credential || credential.publicKey !== publicKey) return null;
  return {
    workerId: credential.workerId.toString(),
    keyId: credential.keyId,
    expiresAt: credential.expiresAt,
  };
}

function enrollmentLabels(input: WorkerEnrollment): Record<string, string> {
  return {
    provider: input.provider.name,
    capabilities: input.provider.capabilities.join(","),
    agentName: input.agent.name,
    agentVersion: input.agent.version,
    agentPhase: input.agent.phase,
    agentPlatform: input.agent.platform,
    agentArchitecture: input.agent.architecture,
    agentNodeVersion: input.agent.nodeVersion,
  };
}

function toWorkerCapacity(input: {
  cpuCores: number;
  memoryBytes: number;
  diskBytes: number;
  concurrentOperations: number;
}) {
  return {
    cpuMillicores: Math.floor(input.cpuCores * 1_000),
    memoryMiB: Math.floor(input.memoryBytes / 1_048_576),
    storageGiB: Math.floor(input.diskBytes / 1_073_741_824),
    concurrentOperations: input.concurrentOperations,
  };
}

function zeroWorkerCapacity() {
  return {
    cpuMillicores: 0,
    memoryMiB: 0,
    storageGiB: 0,
    concurrentOperations: 0,
  };
}

function validatePublicKey(publicKey: string): void {
  try {
    importEd25519PublicKey(publicKey);
  } catch {
    throw new AppError(
      400,
      "INVALID_WORKER_PUBLIC_KEY",
      "The worker public key is invalid.",
    );
  }
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 11000,
  );
}
