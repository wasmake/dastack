import {
  constants,
  mkdir,
  open,
  realpath,
  rename,
  type FileHandle,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { z } from "zod";

const agentStateSchema = z
  .object({
    version: z.literal(2),
    phase: z.literal("phase-2-node-heartbeat"),
    controlPlaneUrl: z.string().url(),
    privateKey: z.string().min(40).max(256),
    publicKey: z.string().min(40).max(256),
    workerId: z.string().min(1).max(128).optional(),
    keyId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{12,80}$/)
      .optional(),
    credentialExpiresAt: z.iso.datetime({ offset: true }).optional(),
    enrollment: z
      .object({
        name: z.string().min(1).max(100),
        region: z.string().min(1).max(64),
        provider: z.string().min(1).max(64),
        concurrentOperations: z.number().int().positive().max(1_000),
        capabilities: z.array(z.string().min(1).max(64)).max(32),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const credentialFields = [
      value.workerId,
      value.keyId,
      value.credentialExpiresAt,
    ];
    if (credentialFields.some(Boolean) && !credentialFields.every(Boolean)) {
      context.addIssue({
        code: "custom",
        path: ["workerId"],
        message: "Worker credential fields must be stored together.",
      });
    }
  });

export type AgentState = z.infer<typeof agentStateSchema>;

export function resolveStatePath(input?: string): string {
  const supplied =
    input ?? path.join(homedir(), ".dastack", "worker-agent.json");
  if (supplied.includes("\0")) throw new Error("Invalid state path.");
  if (supplied.split(/[\\/]+/).some((segment) => segment === "..")) {
    throw new Error("State paths cannot traverse parent directories.");
  }
  return path.resolve(supplied);
}

export async function readAgentState(filePath: string): Promise<AgentState> {
  await ensurePrivateDirectory(path.dirname(filePath));
  const file = await openPrivateFile(filePath);
  try {
    const contents = await file.readFile("utf8");
    return agentStateSchema.parse(JSON.parse(contents));
  } finally {
    await file.close();
  }
}

export async function writeAgentState(
  filePath: string,
  rawState: AgentState,
): Promise<void> {
  const state = agentStateSchema.parse(rawState);
  const directory = path.dirname(filePath);
  await ensurePrivateDirectory(directory);
  try {
    const existing = await openPrivateFile(filePath);
    await existing.close();
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }

  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  const file = await open(
    temporary,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
    await file.sync();
  } catch (error) {
    await file.close();
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  await file.close();
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  const storedFile = await openPrivateFile(filePath);
  await storedFile.close();

  const directoryHandle = await open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
}

function isMissingFile(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT",
  );
}

async function ensurePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const canonicalDirectory = await realpath(directory);
  if (canonicalDirectory !== directory) {
    throw new Error(
      "The worker state directory cannot contain symbolic links.",
    );
  }
  const handle = await open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const metadata = await handle.stat();
    if (!metadata.isDirectory()) {
      throw new Error("The worker state directory is not a directory.");
    }
    assertOwned(metadata.uid, "directory");
    if ((metadata.mode & 0o077) !== 0) await handle.chmod(0o700);
  } finally {
    await handle.close();
  }
}

async function openPrivateFile(filePath: string): Promise<FileHandle> {
  let file: FileHandle;
  try {
    file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (hasCode(error, "ELOOP")) {
      throw new Error("Worker state cannot be a symbolic link.");
    }
    throw error;
  }
  try {
    const metadata = await file.stat();
    if (!metadata.isFile()) {
      throw new Error("Worker state must be a regular file.");
    }
    assertOwned(metadata.uid, "file");
    if ((metadata.mode & 0o077) !== 0) await file.chmod(0o600);
    return file;
  } catch (error) {
    await file.close();
    throw error;
  }
}

function assertOwned(owner: number, resource: string): void {
  if (typeof process.getuid === "function" && owner !== process.getuid()) {
    throw new Error(`The worker state ${resource} must be owned by this user.`);
  }
}

function hasCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === code,
  );
}
