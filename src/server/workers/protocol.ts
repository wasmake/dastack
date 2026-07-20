import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  timingSafeEqual,
  verify,
  type KeyObject,
} from "node:crypto";

export const WORKER_PROTOCOL_VERSION = 2 as const;
export const WORKER_KEY_ID_HEADER = "x-dastack-worker-key-id";
export const WORKER_TIMESTAMP_HEADER = "x-dastack-worker-timestamp";
export const WORKER_NONCE_HEADER = "x-dastack-worker-nonce";
export const WORKER_SIGNATURE_HEADER = "x-dastack-worker-signature";

const REQUEST_DOMAIN = "DASTACK-WORKER-REQUEST-V2";
const COMMAND_DOMAIN = "DASTACK-CONTROL-COMMAND-V1";
const ROTATION_DOMAIN = "DASTACK-WORKER-CREDENTIAL-ROTATION-V1";
const keyIdPattern = /^[A-Za-z0-9_-]{12,80}$/;
const noncePattern = /^[A-Za-z0-9_-]{20,72}$/;
const signaturePattern = /^[A-Za-z0-9_-]{80,120}$/;

export type WorkerCredentialForVerification = {
  workerId: string;
  keyId: string;
  publicKey: string;
  status: "active" | "revoked";
  expiresAt: Date;
};

export type SignedWorkerRequest = {
  method: string;
  pathname: string;
  timestamp: string;
  nonce: string;
  keyId: string;
  signature: string;
  body: Uint8Array;
};

export type VerifyWorkerRequestDependencies = {
  findCredential: (
    keyId: string,
  ) => Promise<WorkerCredentialForVerification | null>;
  consumeNonce: (input: {
    workerId: string;
    keyId: string;
    nonce: string;
    expiresAt: Date;
  }) => Promise<boolean>;
  now?: () => Date;
  maxClockSkewMs: number;
  nonceTtlMs: number;
};

export class WorkerProtocolError extends Error {
  constructor(
    public readonly code:
      | "INVALID_HEADERS"
      | "INVALID_TIMESTAMP"
      | "CREDENTIAL_REJECTED"
      | "INVALID_SIGNATURE"
      | "REPLAYED_NONCE",
  ) {
    super("Worker request authentication failed.");
    this.name = "WorkerProtocolError";
  }
}

export function sha256Base64Url(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("base64url");
}

export function canonicalizeWorkerRequest(input: {
  method: string;
  pathname: string;
  timestamp: string;
  nonce: string;
  body: Uint8Array;
}): string {
  if (!input.pathname.startsWith("/") || input.pathname.includes("?")) {
    throw new Error("The canonical pathname must be an absolute URL pathname.");
  }

  return [
    REQUEST_DOMAIN,
    input.method.toUpperCase(),
    input.pathname,
    input.timestamp,
    input.nonce,
    sha256Base64Url(input.body),
  ].join("\n");
}

export function importEd25519PublicKey(publicKey: string): KeyObject {
  const key = createPublicKey({
    key: decodeCanonicalBase64(publicKey),
    format: "der",
    type: "spki",
  });
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("Expected an Ed25519 public key.");
  }
  return key;
}

export function importEd25519PrivateKey(privateKey: string): KeyObject {
  const key = createPrivateKey({
    key: decodeCanonicalBase64(privateKey),
    format: "der",
    type: "pkcs8",
  });
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("Expected an Ed25519 private key.");
  }
  return key;
}

export function signWorkerRequest(
  input: Omit<SignedWorkerRequest, "keyId" | "signature">,
  privateKey: string | KeyObject,
): string {
  const canonical = canonicalizeWorkerRequest(input);
  const key =
    typeof privateKey === "string"
      ? importEd25519PrivateKey(privateKey)
      : privateKey;
  return sign(null, Buffer.from(canonical, "utf8"), key).toString("base64url");
}

export async function verifyWorkerRequest(
  input: SignedWorkerRequest,
  dependencies: VerifyWorkerRequestDependencies,
): Promise<WorkerCredentialForVerification> {
  if (
    !keyIdPattern.test(input.keyId) ||
    !noncePattern.test(input.nonce) ||
    !signaturePattern.test(input.signature)
  ) {
    throw new WorkerProtocolError("INVALID_HEADERS");
  }

  const timestampMs = parseTimestamp(input.timestamp);
  const now = (dependencies.now ?? (() => new Date()))();
  if (Math.abs(now.getTime() - timestampMs) > dependencies.maxClockSkewMs) {
    throw new WorkerProtocolError("INVALID_TIMESTAMP");
  }

  const credential = await dependencies.findCredential(input.keyId);
  if (
    !credential ||
    credential.keyId !== input.keyId ||
    credential.status !== "active" ||
    credential.expiresAt.getTime() <= now.getTime()
  ) {
    throw new WorkerProtocolError("CREDENTIAL_REJECTED");
  }

  let signatureValid = false;
  try {
    const canonical = canonicalizeWorkerRequest(input);
    signatureValid = verify(
      null,
      Buffer.from(canonical, "utf8"),
      importEd25519PublicKey(credential.publicKey),
      Buffer.from(input.signature, "base64url"),
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) throw new WorkerProtocolError("INVALID_SIGNATURE");

  const nonceExpiresAt = new Date(
    Math.max(now.getTime(), timestampMs) + dependencies.nonceTtlMs,
  );
  if (
    !(await dependencies.consumeNonce({
      workerId: credential.workerId,
      keyId: credential.keyId,
      nonce: input.nonce,
      expiresAt: nonceExpiresAt,
    }))
  ) {
    throw new WorkerProtocolError("REPLAYED_NONCE");
  }

  return credential;
}

export function readWorkerSignatureHeaders(headers: Headers): {
  keyId: string;
  timestamp: string;
  nonce: string;
  signature: string;
} {
  return {
    keyId: headers.get(WORKER_KEY_ID_HEADER) ?? "",
    timestamp: headers.get(WORKER_TIMESTAMP_HEADER) ?? "",
    nonce: headers.get(WORKER_NONCE_HEADER) ?? "",
    signature: headers.get(WORKER_SIGNATURE_HEADER) ?? "",
  };
}

export type ControlCommandEnvelope = {
  version: 1;
  algorithm: "Ed25519";
  keyId: string;
  commandId: string;
  workerId: string;
  issuedAt: string;
  expiresAt: string;
  payloadDigest: string;
  signature: string;
};

export function signControlCommand(input: {
  keyId: string;
  commandId: string;
  workerId: string;
  issuedAt: Date;
  expiresAt: Date;
  payload: Uint8Array;
  privateKey: string | KeyObject;
}): ControlCommandEnvelope {
  if (
    !keyIdPattern.test(input.keyId) ||
    !keyIdPattern.test(input.commandId) ||
    !/^[a-fA-F0-9]{24}$/.test(input.workerId)
  ) {
    throw new Error("Invalid command signing identifier.");
  }
  if (input.expiresAt.getTime() <= input.issuedAt.getTime()) {
    throw new Error("A control command must expire after it is issued.");
  }

  const issuedAt = input.issuedAt.toISOString();
  const expiresAt = input.expiresAt.toISOString();
  const payloadDigest = sha256Base64Url(input.payload);
  const canonical = [
    COMMAND_DOMAIN,
    input.keyId,
    input.commandId,
    input.workerId,
    issuedAt,
    expiresAt,
    payloadDigest,
  ].join("\n");
  const key =
    typeof input.privateKey === "string"
      ? importEd25519PrivateKey(input.privateKey)
      : input.privateKey;

  return {
    version: 1,
    algorithm: "Ed25519",
    keyId: input.keyId,
    commandId: input.commandId,
    workerId: input.workerId,
    issuedAt,
    expiresAt,
    payloadDigest,
    signature: sign(null, Buffer.from(canonical, "utf8"), key).toString(
      "base64url",
    ),
  };
}

export function signCredentialRotationProof(input: {
  workerId: string;
  challengeId: string;
  challenge: string;
  publicKey: string;
  privateKey: string | KeyObject;
}): string {
  const canonical = canonicalizeCredentialRotation(input);
  const key =
    typeof input.privateKey === "string"
      ? importEd25519PrivateKey(input.privateKey)
      : input.privateKey;
  return sign(null, Buffer.from(canonical, "utf8"), key).toString("base64url");
}

export function verifyCredentialRotationProof(input: {
  workerId: string;
  challengeId: string;
  challenge: string;
  publicKey: string;
  proof: string;
}): boolean {
  try {
    return verify(
      null,
      Buffer.from(canonicalizeCredentialRotation(input), "utf8"),
      importEd25519PublicKey(input.publicKey),
      Buffer.from(input.proof, "base64url"),
    );
  } catch {
    return false;
  }
}

export function matchesSha256Hex(value: string, expectedHex: string): boolean {
  const actual = createHash("sha256").update(value, "utf8").digest();
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function parseTimestamp(value: string): number {
  if (!/^\d{13}$/.test(value)) {
    throw new WorkerProtocolError("INVALID_TIMESTAMP");
  }
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp)) {
    throw new WorkerProtocolError("INVALID_TIMESTAMP");
  }
  return timestamp;
}

function decodeCanonicalBase64(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > 256) {
    throw new Error("Invalid base64 key material.");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Error("Non-canonical base64 key material.");
  }
  return decoded;
}

function canonicalizeCredentialRotation(input: {
  workerId: string;
  challengeId: string;
  challenge: string;
  publicKey: string;
}): string {
  if (
    !/^[a-fA-F0-9]{24}$/.test(input.workerId) ||
    !keyIdPattern.test(input.challengeId) ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.challenge)
  ) {
    throw new Error("Invalid credential rotation challenge.");
  }
  return [
    ROTATION_DOMAIN,
    input.workerId,
    input.challengeId,
    input.challenge,
    sha256Base64Url(decodeCanonicalBase64(input.publicKey)),
  ].join("\n");
}
