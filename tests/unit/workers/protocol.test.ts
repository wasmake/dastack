import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  canonicalizeWorkerRequest,
  sha256Base64Url,
  signControlCommand,
  signCredentialRotationProof,
  signWorkerRequest,
  verifyCredentialRotationProof,
  verifyWorkerRequest,
  WorkerProtocolError,
  type SignedWorkerRequest,
} from "../../../src/server/workers/protocol";

function testKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKey: privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
    publicKey: publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64"),
  };
}

function signedRequest(
  privateKey: string,
  overrides: Partial<SignedWorkerRequest> = {},
): SignedWorkerRequest {
  const unsigned = {
    method: "POST",
    pathname: "/api/workers/heartbeat",
    timestamp: "1784455200000",
    nonce: "nonce_abcdefghijklmnopqrstuvwxyz",
    body: Buffer.from('{"protocolVersion":2}', "utf8"),
    ...overrides,
  };
  return {
    ...unsigned,
    keyId: overrides.keyId ?? "wk_abcdefghijklmnopqrstuvwx",
    signature: signWorkerRequest(unsigned, privateKey),
  };
}

describe("worker request protocol", () => {
  it("canonicalizes method, pathname, timestamp, nonce, and body digest", () => {
    const body = Buffer.from('{"status":"ready"}', "utf8");
    expect(
      canonicalizeWorkerRequest({
        method: "post",
        pathname: "/api/workers/heartbeat",
        timestamp: "1784455200000",
        nonce: "nonce_abcdefghijklmnopqrstuvwxyz",
        body,
      }),
    ).toBe(
      [
        "DASTACK-WORKER-REQUEST-V2",
        "POST",
        "/api/workers/heartbeat",
        "1784455200000",
        "nonce_abcdefghijklmnopqrstuvwxyz",
        sha256Base64Url(body),
      ].join("\n"),
    );
  });

  it("verifies an Ed25519 signature and rejects a changed raw body", async () => {
    const keys = testKeys();
    const request = signedRequest(keys.privateKey);
    const dependencies = {
      now: () => new Date(1_784_455_200_000),
      maxClockSkewMs: 60_000,
      nonceTtlMs: 300_000,
      findCredential: async () => ({
        workerId: "worker-1",
        keyId: request.keyId,
        publicKey: keys.publicKey,
        status: "active" as const,
        expiresAt: new Date(1_784_541_600_000),
      }),
      consumeNonce: async () => true,
    };
    await expect(
      verifyWorkerRequest(request, dependencies),
    ).resolves.toMatchObject({
      workerId: "worker-1",
    });
    await expect(
      verifyWorkerRequest(
        { ...request, body: Buffer.from('{"protocolVersion":3}', "utf8") },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
  });

  it("rejects nonce replay after a valid signature", async () => {
    const keys = testKeys();
    const request = signedRequest(keys.privateKey);
    const consumed = new Set<string>();
    const dependencies = {
      now: () => new Date(1_784_455_200_000),
      maxClockSkewMs: 60_000,
      nonceTtlMs: 300_000,
      findCredential: async () => ({
        workerId: "worker-1",
        keyId: request.keyId,
        publicKey: keys.publicKey,
        status: "active" as const,
        expiresAt: new Date(1_784_541_600_000),
      }),
      consumeNonce: async ({ nonce }: { nonce: string }) => {
        if (consumed.has(nonce)) return false;
        consumed.add(nonce);
        return true;
      },
    };
    await verifyWorkerRequest(request, dependencies);
    await expect(verifyWorkerRequest(request, dependencies)).rejects.toEqual(
      expect.objectContaining<Partial<WorkerProtocolError>>({
        code: "REPLAYED_NONCE",
      }),
    );
  });

  it("enforces strict past and future timestamp bounds", async () => {
    const keys = testKeys();
    const base = signedRequest(keys.privateKey);
    const dependencies = {
      now: () => new Date(1_784_455_200_000),
      maxClockSkewMs: 60_000,
      nonceTtlMs: 300_000,
      findCredential: async () => null,
      consumeNonce: async () => true,
    };
    const old = signedRequest(keys.privateKey, {
      timestamp: "1784455139999",
    });
    const future = signedRequest(keys.privateKey, {
      timestamp: "1784455260001",
      nonce: "nonce_future_abcdefghijklmnopqr",
    });
    await expect(verifyWorkerRequest(old, dependencies)).rejects.toMatchObject({
      code: "INVALID_TIMESTAMP",
    });
    await expect(
      verifyWorkerRequest(future, dependencies),
    ).rejects.toMatchObject({ code: "INVALID_TIMESTAMP" });
    expect(base.timestamp).toBe("1784455200000");
  });

  it("signs command metadata against the exact payload digest", () => {
    const keys = testKeys();
    const payload = Buffer.from('{"operation":"heartbeat-only"}', "utf8");
    const envelope = signControlCommand({
      keyId: "control_abcdefghijklmnop",
      commandId: "command_abcdefghijklmnop",
      workerId: "abcdefabcdefabcdefabcdef",
      issuedAt: new Date("2026-07-19T10:00:00.000Z"),
      expiresAt: new Date("2026-07-19T10:01:00.000Z"),
      payload,
      privateKey: keys.privateKey,
    });
    expect(envelope).toMatchObject({
      algorithm: "Ed25519",
      keyId: "control_abcdefghijklmnop",
      commandId: "command_abcdefghijklmnop",
      workerId: "abcdefabcdefabcdefabcdef",
      payloadDigest: sha256Base64Url(payload),
      expiresAt: "2026-07-19T10:01:00.000Z",
    });
    expect(envelope.signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
  });

  it("requires proof of the replacement private key for rotation", () => {
    const replacement = testKeys();
    const other = testKeys();
    const rotation = {
      workerId: "abcdefabcdefabcdefabcdef",
      challengeId: "rc_abcdefghijklmnopqrstuvwx",
      challenge: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ",
      publicKey: replacement.publicKey,
    };
    const proof = signCredentialRotationProof({
      ...rotation,
      privateKey: replacement.privateKey,
    });
    expect(verifyCredentialRotationProof({ ...rotation, proof })).toBe(true);
    expect(
      verifyCredentialRotationProof({
        ...rotation,
        proof: signCredentialRotationProof({
          ...rotation,
          privateKey: other.privateKey,
        }),
      }),
    ).toBe(false);
  });
});
