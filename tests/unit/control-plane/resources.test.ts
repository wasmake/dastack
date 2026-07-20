import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import {
  quotaExceeded,
  reservationQuotaDelta,
} from "@/features/resources/quota";
import { transitionReservationState } from "@/features/resources/reservation-state";
import {
  rankWorkerCandidates,
  type WorkerCandidate,
} from "@/features/resources/worker-selection";
import type {
  ResourceQuotaCounters,
  ResourceQuotaLimits,
  WorkerResourceCapacity,
} from "@/server/domain/resources";

const limits: ResourceQuotaLimits = {
  cpuMillicores: 2_000,
  memoryMiB: 4_096,
  storageGiB: 100,
  transferGiB: 1_000,
  backups: 10,
  concurrentOperations: 5,
  projects: 2,
  environments: 4,
  services: 3,
};
const zero: ResourceQuotaCounters = {
  cpuMillicores: 0,
  memoryMiB: 0,
  storageGiB: 0,
  transferGiB: 0,
  backups: 0,
  concurrentOperations: 0,
  projects: 0,
  environments: 0,
  services: 0,
};

function worker(
  providerNodeId: string,
  reservedCpu: number,
  now: Date,
): WorkerCandidate {
  return {
    _id: new Types.ObjectId(),
    providerNodeId,
    region: "us-east",
    status: "online",
    schedulable: true,
    lastHeartbeatAt: now,
    capacity: {
      cpuMillicores: 2_000,
      memoryMiB: 4_096,
      storageGiB: 100,
      concurrentOperations: 10,
    },
    reserved: {
      cpuMillicores: reservedCpu,
      memoryMiB: 0,
      storageGiB: 0,
      concurrentOperations: 0,
    },
    allocated: {
      cpuMillicores: 0,
      memoryMiB: 0,
      storageGiB: 0,
      concurrentOperations: 0,
    },
  };
}

describe("resource quotas", () => {
  it("checks consumable and count quotas", () => {
    const requested = reservationQuotaDelta({
      cpuMillicores: 500,
      memoryMiB: 512,
      storageGiB: 5,
      transferGiB: 10,
      backups: 1,
      concurrentOperations: 1,
    });
    expect(
      quotaExceeded(limits, zero, zero, requested, {
        projects: 1,
        environments: 2,
      }),
    ).toBeNull();
    expect(
      quotaExceeded(
        limits,
        { ...zero, cpuMillicores: 1_700 },
        zero,
        requested,
        { projects: 1, environments: 2 },
      ),
    ).toBe("cpuMillicores");
    expect(
      quotaExceeded(limits, zero, zero, requested, {
        projects: 3,
        environments: 2,
      }),
    ).toBe("projects");
  });
});

describe("reservation state transitions", () => {
  it("is idempotent and rejects confirmation after release", () => {
    expect(transitionReservationState("reserved", "confirm")).toEqual({
      next: "confirmed",
      changed: true,
    });
    expect(transitionReservationState("confirmed", "confirm")).toEqual({
      next: "confirmed",
      changed: false,
    });
    expect(transitionReservationState("confirmed", "release")).toEqual({
      next: "released",
      changed: true,
    });
    expect(() => transitionReservationState("released", "confirm")).toThrow(
      "cannot be confirmed",
    );
  });
});

describe("worker selection", () => {
  it("filters capacity and stale heartbeats then chooses the least-loaded worker", () => {
    const now = new Date("2026-07-19T12:00:00.000Z");
    const requested: WorkerResourceCapacity = {
      cpuMillicores: 600,
      memoryMiB: 512,
      storageGiB: 10,
      concurrentOperations: 1,
    };
    const stale = worker("stale", 0, new Date(now.getTime() - 5 * 60_000));
    const full = worker("full", 1_600, now);
    const loaded = worker("loaded", 1_000, now);
    const available = worker("available", 100, now);

    expect(
      rankWorkerCandidates(
        [stale, full, loaded, available],
        requested,
        now,
      ).map((candidate) => candidate.providerNodeId),
    ).toEqual(["available", "loaded"]);
  });
});
