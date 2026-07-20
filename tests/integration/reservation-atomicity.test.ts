import { generateKeyPairSync } from "node:crypto";

import mongoose, { Types } from "mongoose";
import { MongoServerError } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/authorization", () => ({
  requireOrganizationPermission: vi.fn().mockResolvedValue({}),
}));

const organizationId = new Types.ObjectId();
const actorId = new Types.ObjectId();
const projectId = new Types.ObjectId();
const environmentId = new Types.ObjectId();
const workerId = new Types.ObjectId();

beforeAll(async () => {
  process.env.APP_URL ??= "http://localhost:3000";
  process.env.AUTH_SECRET ??=
    "integration-auth-secret-with-at-least-thirty-two-bytes";
  process.env.MONGODB_DB ??= "dastack";
  process.env.MONGODB_URI ??=
    "mongodb://dastack:change-me-local-mongo-app@127.0.0.1:27017/dastack?authSource=dastack&replicaSet=rs0&directConnection=true";
  process.env.EMAIL_ADAPTER ??= "file";
  process.env.EMAIL_DEV_DIR ??= "/tmp/dastack-emails";
  process.env.EMAIL_FROM ??= "DaStack Test <no-reply@example.test>";
  process.env.TRUST_PROXY ??= "false";
  process.env.WORKER_ALLOW_INSECURE_HTTP = "true";
  process.env.WORKER_CREDENTIAL_TTL_SECONDS = "3600";
  process.env.WORKER_SYSTEM_ACTOR_ID = actorId.toString();
  process.env.WORKER_SYSTEM_ORGANIZATION_ID = organizationId.toString();

  const { connectMongoose } = await import("@/server/db/mongodb");
  const {
    EnvironmentModel,
    ProjectModel,
    ResourceEntitlementModel,
    WorkerNodeModel,
  } = await import("@/server/db/control-plane-models");
  await connectMongoose();
  const now = new Date();
  await Promise.all([
    ProjectModel.create({
      _id: projectId,
      organizationId,
      name: "Atomic Project",
      slug: `atomic-project-${process.pid}`,
      createdBy: actorId,
      updatedBy: actorId,
    }),
    EnvironmentModel.create({
      _id: environmentId,
      organizationId,
      projectId,
      name: "Atomic Environment",
      slug: `atomic-environment-${process.pid}`,
      type: "production",
      isDefault: false,
      region: "atomic-region",
      networkId: `net_atomic_${process.pid}`,
      createdBy: actorId,
      updatedBy: actorId,
    }),
    WorkerNodeModel.create({
      _id: workerId,
      providerNodeId: `atomic-worker-${process.pid}`,
      name: "Atomic Worker",
      region: "atomic-region",
      status: "online",
      schedulable: true,
      lastHeartbeatAt: now,
      capacity: {
        cpuMillicores: 1_000,
        memoryMiB: 1_024,
        storageGiB: 100,
        concurrentOperations: 2,
      },
      provider: { name: "integration", capabilities: ["capacity"] },
      runtime: {
        phase: "phase-2-node-heartbeat",
        platform: "linux",
        architecture: "x64",
        nodeVersion: process.version,
        hostname: "integration-worker",
        managedRuntime: "none",
        uptimeSeconds: 1,
      },
      hostUsage: { loadAverage1m: 0, memoryUsedBytes: 0, diskUsedBytes: 0 },
      createdBy: actorId,
      updatedBy: actorId,
    }),
    ResourceEntitlementModel.create({
      organizationId,
      status: "active",
      billingStatus: "active",
      validFrom: new Date(now.getTime() - 60_000),
      validUntil: null,
      limits: {
        cpuMillicores: 1_000,
        memoryMiB: 1_024,
        storageGiB: 100,
        transferGiB: 1_000,
        backups: 10,
        concurrentOperations: 2,
        projects: 10,
        environments: 10,
        services: 10,
      },
      createdBy: actorId,
      updatedBy: actorId,
    }),
  ]);
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    const collections = [
      "audit_logs",
      "environments",
      "idempotency_records",
      "outbox_events",
      "projects",
      "resource_entitlements",
      "resource_reservations",
      "worker_nodes",
      "worker_credentials",
    ];
    await Promise.all(
      collections.map((collection) =>
        mongoose.connection.collection(collection).deleteMany({
          $or: [
            { organizationId },
            { _id: { $in: [projectId, environmentId, workerId] } },
            { workerId },
          ],
        }),
      ),
    );
    await mongoose.disconnect();
  }
});

describe("resource reservation atomicity", () => {
  it("recovers an identical credential rotation after response loss", async () => {
    const { WorkerCredentialModel } =
      await import("@/server/db/control-plane-models");
    const { createCredentialRotationChallenge, rotateWorkerCredential } =
      await import("@/server/workers/service");
    const { signCredentialRotationProof } =
      await import("@/server/workers/protocol");
    const oldKeys = generateKeyPairSync("ed25519");
    const oldKeyId = "wk_integration_old_key";
    const oldExpiresAt = new Date(Date.now() + 60 * 60_000);
    await WorkerCredentialModel.create({
      workerId,
      keyId: oldKeyId,
      publicKey: oldKeys.publicKey
        .export({ format: "der", type: "spki" })
        .toString("base64"),
      status: "active",
      expiresAt: oldExpiresAt,
      createdBy: actorId,
      updatedBy: actorId,
    });
    const credential = {
      workerId: workerId.toString(),
      keyId: oldKeyId,
      publicKey: oldKeys.publicKey
        .export({ format: "der", type: "spki" })
        .toString("base64"),
      status: "active" as const,
      expiresAt: oldExpiresAt,
    };
    const challenge = await createCredentialRotationChallenge({
      credential,
      payload: { protocolVersion: 2 },
      bodyDigest: "challenge",
    });
    const newKeys = generateKeyPairSync("ed25519");
    const publicKey = newKeys.publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64");
    const payload = {
      protocolVersion: 2 as const,
      publicKey: {
        algorithm: "Ed25519" as const,
        format: "spki-der" as const,
        value: publicKey,
      },
      challengeId: challenge.challengeId,
      challenge: challenge.challenge,
      proof: signCredentialRotationProof({
        workerId: workerId.toString(),
        challengeId: challenge.challengeId,
        challenge: challenge.challenge,
        publicKey,
        privateKey: newKeys.privateKey,
      }),
    };
    const authenticated = { credential, payload, bodyDigest: "rotation" };
    const context = {
      requestId: "rotation-response-loss",
      ipHash: "test-ip",
      userAgent: "vitest",
    };

    const first = await rotateWorkerCredential(authenticated, context);
    const recovered = await rotateWorkerCredential(authenticated, context);

    expect(recovered).toEqual(first);
    await expect(
      WorkerCredentialModel.countDocuments({ workerId, status: "active" }),
    ).resolves.toBe(1);
    const oldCredential = await WorkerCredentialModel.findOne({
      keyId: oldKeyId,
    }).lean();
    expect(oldCredential?.status).toBe("rotating");
  });

  it("retries transactions that save strict embedded documents", async () => {
    const { WorkerNodeModel } =
      await import("@/server/db/control-plane-models");
    const { runTransaction } = await import("@/server/domain/transactions");
    let attempts = 0;

    await runTransaction(async (session) => {
      attempts += 1;
      const worker = await WorkerNodeModel.findById(workerId).session(session);
      expect(worker).not.toBeNull();
      worker!.hostUsage.loadAverage1m = attempts;
      await worker!.save({ session });
      if (attempts === 1) {
        const error = new MongoServerError({
          ok: 0,
          code: 112,
          errmsg: "Forced transient transaction retry.",
        });
        error.addErrorLabel("TransientTransactionError");
        throw error;
      }
    });

    expect(attempts).toBe(2);
    const worker = await WorkerNodeModel.findById(workerId).lean();
    expect(worker?.hostUsage.loadAverage1m).toBe(2);
  });

  it("does not oversell entitlement or worker counters under a race", async () => {
    const {
      confirmResourceReservation,
      releaseResourceReservation,
      reserveResource,
    } = await import("@/features/resources/reservations");
    const actor = {
      id: actorId.toString(),
      email: "atomic@example.test",
      sessionId: "atomic-session",
      tokenVersion: 0,
    };
    const request = {
      projectId: projectId.toString(),
      environmentId: environmentId.toString(),
      resources: {
        cpuMillicores: 700,
        memoryMiB: 700,
        storageGiB: 10,
        transferGiB: 10,
        backups: 1,
        concurrentOperations: 1,
      },
    };
    const outcomes = await Promise.allSettled([
      reserveResource(
        organizationId.toString(),
        request,
        "atomic-key-one",
        actor,
        {
          requestId: "atomic-request-one",
          ipHash: "test-ip",
          userAgent: "vitest",
        },
      ),
      reserveResource(
        organizationId.toString(),
        request,
        "atomic-key-two",
        actor,
        {
          requestId: "atomic-request-two",
          ipHash: "test-ip",
          userAgent: "vitest",
        },
      ),
    ]);

    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);

    const {
      ResourceEntitlementModel,
      ResourceReservationModel,
      WorkerNodeModel,
    } = await import("@/server/db/control-plane-models");
    const [entitlement, worker, reservations] = await Promise.all([
      ResourceEntitlementModel.findOne({ organizationId }).lean(),
      WorkerNodeModel.findById(workerId).lean(),
      ResourceReservationModel.countDocuments({ organizationId }),
    ]);
    expect(entitlement?.reserved.cpuMillicores).toBe(700);
    expect(entitlement?.reserved.memoryMiB).toBe(700);
    expect(worker?.reserved.cpuMillicores).toBe(700);
    expect(worker?.reserved.memoryMiB).toBe(700);
    expect(reservations).toBe(1);

    const reservation = await ResourceReservationModel.findOne({
      organizationId,
    }).lean();
    const lifecycleContext = {
      requestId: "atomic-lifecycle",
      ipHash: "test-ip",
      userAgent: "vitest",
    };
    await confirmResourceReservation(
      organizationId.toString(),
      reservation!._id.toString(),
      actor,
      lifecycleContext,
    );
    await confirmResourceReservation(
      organizationId.toString(),
      reservation!._id.toString(),
      actor,
      lifecycleContext,
    );
    const [confirmedEntitlement, confirmedWorker] = await Promise.all([
      ResourceEntitlementModel.findOne({ organizationId }).lean(),
      WorkerNodeModel.findById(workerId).lean(),
    ]);
    expect(confirmedEntitlement?.reserved.cpuMillicores).toBe(0);
    expect(confirmedEntitlement?.allocated.cpuMillicores).toBe(700);
    expect(confirmedWorker?.reserved.cpuMillicores).toBe(0);
    expect(confirmedWorker?.allocated.cpuMillicores).toBe(700);

    const { releaseReservationInternal } =
      await import("@/features/resources/reservation-release");
    const staleRelease = await releaseReservationInternal({
      organizationId: organizationId.toString(),
      reservationId: reservation!._id.toString(),
      reason: "stale",
      actorUserId: actorId.toString(),
      requestId: "stale-race-after-confirmation",
    });
    expect(staleRelease.changed).toBe(false);
    const afterStaleRace = await ResourceEntitlementModel.findOne({
      organizationId,
    }).lean();
    expect(afterStaleRace?.allocated.cpuMillicores).toBe(700);

    await releaseResourceReservation(
      organizationId.toString(),
      reservation!._id.toString(),
      { reason: "requested" },
      actor,
      lifecycleContext,
    );
    await releaseResourceReservation(
      organizationId.toString(),
      reservation!._id.toString(),
      { reason: "requested" },
      actor,
      lifecycleContext,
    );
    const [releasedEntitlement, releasedWorker, eventCount] = await Promise.all(
      [
        ResourceEntitlementModel.findOne({ organizationId }).lean(),
        WorkerNodeModel.findById(workerId).lean(),
        mongoose.connection
          .collection("outbox_events")
          .countDocuments({ organizationId }),
      ],
    );
    expect(releasedEntitlement?.reserved.cpuMillicores).toBe(0);
    expect(releasedEntitlement?.allocated.cpuMillicores).toBe(0);
    expect(releasedWorker?.reserved.cpuMillicores).toBe(0);
    expect(releasedWorker?.allocated.cpuMillicores).toBe(0);
    expect(eventCount).toBe(3);
  });
});
