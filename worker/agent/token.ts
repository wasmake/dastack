import { createHash, randomBytes } from "node:crypto";

const token = randomBytes(32).toString("base64url");
console.info(
  JSON.stringify(
    {
      token,
      digest: createHash("sha256").update(token, "utf8").digest("hex"),
    },
    null,
    2,
  ),
);
