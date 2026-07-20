export function scopedMongoUri(
  lifecycleUri: string,
  username: string,
  password: string,
  databaseName: string,
): string {
  const match =
    /^(mongodb(?:\+srv)?:\/\/)(?:[^@/?#]+@)?([^/?#]+)(?:\/[^?#]*)?(?:\?([^#]*))?$/.exec(
      lifecycleUri,
    );
  if (!match) throw new Error("E2E_MONGODB_URI is not a valid MongoDB URI.");
  const parameters = new URLSearchParams(match[3] ?? "");
  const lifecycleAuthenticationOptions = new Set([
    "authsource",
    "authmechanism",
    "authmechanismproperties",
  ]);
  for (const key of [...parameters.keys()]) {
    if (lifecycleAuthenticationOptions.has(key.toLowerCase())) {
      parameters.delete(key);
    }
  }
  parameters.set("authSource", databaseName);
  return `${match[1]}${encodeURIComponent(username)}:${encodeURIComponent(password)}@${match[2]}/${databaseName}?${parameters.toString()}`;
}
