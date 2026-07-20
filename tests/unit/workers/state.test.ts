import { chmod, mkdtemp, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  readAgentState,
  writeAgentState,
  type AgentState,
} from "../../../worker/agent/state";

const temporaryDirectories: string[] = [];

function state(): AgentState {
  return {
    version: 2,
    phase: "phase-2-node-heartbeat",
    controlPlaneUrl: "https://control.example.test/",
    privateKey: "a".repeat(64),
    publicKey: "b".repeat(64),
    enrollment: {
      name: "unit-worker",
      region: "local-1",
      provider: "unit",
      concurrentOperations: 1,
      capabilities: [],
    },
  };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "dastack-state-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("worker agent state", () => {
  it("hardens the state directory and file permissions", async () => {
    const root = await temporaryDirectory();
    await chmod(root, 0o777);
    const filePath = path.join(root, "worker.json");

    await writeAgentState(filePath, state());

    expect(await readAgentState(filePath)).toEqual(state());
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it("refuses symbolic-link state files", async () => {
    const root = await temporaryDirectory();
    const filePath = path.join(root, "worker.json");
    const linkPath = path.join(root, "linked.json");
    await writeAgentState(filePath, state());
    await symlink(filePath, linkPath);

    await expect(readAgentState(linkPath)).rejects.toThrow("symbolic link");
  });

  it("validates and hardens the state directory before reads", async () => {
    const root = await temporaryDirectory();
    const filePath = path.join(root, "worker.json");
    await writeAgentState(filePath, state());
    await chmod(root, 0o777);

    await expect(readAgentState(filePath)).resolves.toEqual(state());
    expect((await stat(root)).mode & 0o777).toBe(0o700);

    const parent = await temporaryDirectory();
    const linkedDirectory = path.join(parent, "linked");
    await symlink(root, linkedDirectory);
    await expect(
      readAgentState(path.join(linkedDirectory, "worker.json")),
    ).rejects.toThrow("symbolic links");
  });
});
