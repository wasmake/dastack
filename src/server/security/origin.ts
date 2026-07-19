import { getServerEnv } from "@/server/env";
import { AppError } from "@/server/security/errors";

export function assertMutationOrigin(request: Request): void {
  const expected = new URL(getServerEnv().APP_URL).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (
    !origin ||
    origin !== expected ||
    (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite))
  ) {
    throw new AppError(
      403,
      "INVALID_ORIGIN",
      "The request origin was rejected.",
    );
  }
}
