import { describe, expect, it } from "vitest";

import { scopedMongoUri } from "../../../scripts/e2e-mongo-uri";

describe("E2E MongoDB URI scoping", () => {
  it("supports replica-set host lists without retaining lifecycle credentials", () => {
    const scoped = scopedMongoUri(
      "mongodb://root:secret@mongo-a:27017,mongo-b:27018/admin?replicaSet=rs0&directConnection=false&AUTHMECHANISM=MONGODB-AWS&authmechanismproperties=AWS_SESSION_TOKEN:privileged&AUTHSOURCE=admin",
      "run-user",
      "run/password",
      "dastack_e2e_0123456789abcdef",
    );

    expect(scoped).toBe(
      "mongodb://run-user:run%2Fpassword@mongo-a:27017,mongo-b:27018/dastack_e2e_0123456789abcdef?replicaSet=rs0&directConnection=false&authSource=dastack_e2e_0123456789abcdef",
    );
    expect(scoped).not.toContain("root");
    expect(scoped).not.toContain("secret");
    expect(scoped).not.toContain("authMechanism");
    expect(scoped).not.toContain("privileged");
  });

  it("preserves SRV connection options", () => {
    expect(
      scopedMongoUri(
        "mongodb+srv://admin:secret@cluster.example.test/admin?retryWrites=true",
        "run-user",
        "run-secret",
        "dastack_e2e_0123456789abcdef",
      ),
    ).toContain("retryWrites=true&authSource=dastack_e2e_0123456789abcdef");
  });
});
