import { describe, expect, it } from "vitest";

import { disconnectedWorkerTransition } from "../../../src/server/jobs/disconnected-state";

describe("disconnected worker transition", () => {
  const now = new Date("2026-07-19T10:00:00.000Z");

  it("marks online and draining workers offline after missed heartbeats", () => {
    for (const status of ["online", "draining"] as const) {
      expect(
        disconnectedWorkerTransition(
          {
            status,
            schedulable: true,
            lastHeartbeatAt: new Date("2026-07-19T09:58:00.000Z"),
          },
          now,
          90_000,
        ),
      ).toEqual({ status: "offline", schedulable: false });
    }
  });

  it("does not change recent, offline, or administratively disabled workers", () => {
    expect(
      disconnectedWorkerTransition(
        {
          status: "online",
          schedulable: true,
          lastHeartbeatAt: new Date("2026-07-19T09:59:00.001Z"),
        },
        now,
        60_000,
      ),
    ).toBeNull();
    for (const status of ["offline", "disabled"] as const) {
      expect(
        disconnectedWorkerTransition(
          {
            status,
            schedulable: false,
            lastHeartbeatAt: new Date("2026-07-18T10:00:00.000Z"),
          },
          now,
          60_000,
        ),
      ).toBeNull();
    }
  });
});
