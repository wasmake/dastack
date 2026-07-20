import { afterEach, describe, expect, it, vi } from "vitest";

import {
  QUEUE_NAMES,
  registeredQueueFor,
} from "../../../src/server/jobs/definitions";
import { deterministicJobId } from "../../../src/server/jobs/job-id";
import { jobQueuePrefix } from "../../../src/server/jobs/registry";

afterEach(() => vi.unstubAllEnvs());

describe("BullMQ job definitions", () => {
  it("creates stable, queue-scoped job IDs without BullMQ separators", () => {
    const first = deterministicJobId(
      "worker-cleanup",
      "detect-disconnected-workers",
      "worker-scan:2026-07-19T10:00",
    );
    const replay = deterministicJobId(
      "worker-cleanup",
      "detect-disconnected-workers",
      "worker-scan:2026-07-19T10:00",
    );
    const next = deterministicJobId(
      "worker-cleanup",
      "detect-disconnected-workers",
      "worker-scan:2026-07-19T10:01",
    );
    expect(replay).toBe(first);
    expect(next).not.toBe(first);
    expect(first).not.toContain(":");
  });

  it("registers required queues but rejects undefined work", () => {
    expect(QUEUE_NAMES).toEqual(
      expect.arrayContaining([
        "provisioning",
        "deployments",
        "email",
        "backup",
        "restore",
        "metrics",
        "usage",
        "billing",
        "resource-reconciliation",
        "dns",
        "certificate",
        "ingress",
        "worker-cleanup",
        "suspension",
        "deprovisioning",
      ]),
    );
    expect(registeredQueueFor("reconcile-stale-reservations")).toBe(
      "resource-reconciliation",
    );
    expect(() => registeredQueueFor("pretend-provisioning")).toThrow(
      "No typed job definition",
    );
  });

  it("requires a deployment-specific queue prefix", () => {
    vi.stubEnv("JOB_QUEUE_PREFIX", "dastack-production-a");
    expect(jobQueuePrefix()).toBe("dastack-production-a");

    vi.stubEnv("JOB_QUEUE_PREFIX", "unsafe:shared");
    expect(() => jobQueuePrefix()).toThrow("JOB_QUEUE_PREFIX");
  });
});
