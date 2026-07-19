import { describe, expect, it } from "vitest";

import {
  BUILT_IN_ROLES,
  PERMISSIONS,
  roleHasPermission,
} from "../../../src/features/organizations/permissions";

describe("built-in organization permissions", () => {
  it("grants every permission to owners", () => {
    const owner = BUILT_IN_ROLES.find((role) => role.key === "owner");
    expect(owner?.permissions).toEqual(
      expect.arrayContaining(Object.values(PERMISSIONS)),
    );
  });

  it("does not let admins delete organizations or manage billing", () => {
    const admin = BUILT_IN_ROLES.find((role) => role.key === "admin");
    expect(
      roleHasPermission(
        admin?.permissions ?? [],
        PERMISSIONS.ORGANIZATION_DELETE,
      ),
    ).toBe(false);
    expect(
      roleHasPermission(admin?.permissions ?? [], PERMISSIONS.BILLING_MANAGE),
    ).toBe(false);
  });

  it("keeps viewers read-only", () => {
    const viewer = BUILT_IN_ROLES.find((role) => role.key === "viewer");
    expect(
      roleHasPermission(
        viewer?.permissions ?? [],
        PERMISSIONS.ORGANIZATION_READ,
      ),
    ).toBe(true);
    expect(
      roleHasPermission(viewer?.permissions ?? [], PERMISSIONS.MEMBER_INVITE),
    ).toBe(false);
  });
});
