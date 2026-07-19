import { describe, expect, it } from "vitest";

import {
  normalizeEmail,
  registrationSchema,
} from "../../../src/features/auth/schemas";

describe("auth schemas", () => {
  it("normalizes email addresses", () => {
    expect(normalizeEmail("  USER@Example.COM ")).toBe("user@example.com");
  });

  it("accepts a strong registration request", () => {
    const result = registrationSchema.parse({
      name: "Ada Lovelace",
      email: "ADA@example.com",
      password: "Correct-Horse-42!",
      passwordConfirmation: "Correct-Horse-42!",
      termsAccepted: true,
    });
    expect(result.email).toBe("ada@example.com");
  });

  it("rejects weak, mismatched, or unaccepted registrations", () => {
    expect(() =>
      registrationSchema.parse({
        name: "Ada",
        email: "ada@example.com",
        password: "weakpassword",
        passwordConfirmation: "different",
        termsAccepted: false,
      }),
    ).toThrow();
  });
});
