import type { ResourceReservationState } from "@/server/domain/resources";
import { AppError } from "@/server/security/errors";

export function transitionReservationState(
  current: ResourceReservationState,
  command: "confirm" | "release",
): { next: ResourceReservationState; changed: boolean } {
  if (command === "confirm") {
    if (current === "released") {
      throw new AppError(
        409,
        "INVALID_RESERVATION_STATE",
        "A released reservation cannot be confirmed.",
      );
    }
    return current === "confirmed"
      ? { next: current, changed: false }
      : { next: "confirmed", changed: true };
  }
  return current === "released"
    ? { next: current, changed: false }
    : { next: "released", changed: true };
}
