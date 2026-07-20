import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runHeartbeatLoop } from "../../../worker/agent/client";
import { writeAgentState } from "../../../worker/agent/state";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("worker heartbeat loop", () => {
  it("retries transient server failures and honors shutdown", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const directory = await mkdtemp(path.join(tmpdir(), "dastack-agent-"));
    temporaryDirectories.push(directory);
    const statePath = path.join(directory, "worker.json");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    await writeAgentState(statePath, {
      version: 2,
      phase: "phase-2-node-heartbeat",
      controlPlaneUrl: "https://control.example.test/",
      privateKey: privateKey
        .export({ format: "der", type: "pkcs8" })
        .toString("base64"),
      publicKey: publicKey
        .export({ format: "der", type: "spki" })
        .toString("base64"),
      workerId: "000000000000000000000001",
      keyId: "wk_unit_heartbeat",
      credentialExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      enrollment: {
        name: "unit-worker",
        region: "local-1",
        provider: "unit",
        concurrentOperations: 1,
        capabilities: [],
      },
    });
    const controller = new AbortController();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR" } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockImplementationOnce(async () => {
        controller.abort();
        return new Response(
          JSON.stringify({ data: { acceptedAt: new Date().toISOString() } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      });
    vi.stubGlobal("fetch", request);

    const running = runHeartbeatLoop({
      statePath,
      allowHttp: false,
      intervalSeconds: 5,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(1_000);
    await running;

    expect(request).toHaveBeenCalledTimes(2);
  });
});
