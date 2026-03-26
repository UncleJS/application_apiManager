import { describe, expect, test } from "bun:test";
import { sanitizeAuditMetadata } from "./audit";

describe("sanitizeAuditMetadata", () => {
  test("redacts password-like keys", () => {
    expect(
      sanitizeAuditMetadata({
        username: "alice",
        password: "secret",
        newPassword: "new-secret"
      })
    ).toEqual({
      username: "alice",
      password: "[REDACTED]",
      newPassword: "[REDACTED]"
    });
  });
});
