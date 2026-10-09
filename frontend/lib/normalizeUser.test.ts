import { describe, expect, test } from "bun:test";
import { normalizeUser } from "./normalizeUser";

describe("normalizeUser", () => {
  test("maps /auth/me organizationId onto organization_id", () => {
    const user = normalizeUser({
      id: 4,
      role: "Org Admin",
      organizationId: 9,
      username: "ada"
    });
    expect(user.organization_id).toBe(9);
    expect(user.role).toBe("org_admin");
    expect(user.username).toBe("ada");
  });

  test("coerces numeric strings", () => {
    const user = normalizeUser({
      id: "4",
      role: "org_admin",
      organizationId: "9",
      role_id: "2",
      status_id: "1",
      username: "ada"
    });
    expect(user.id).toBe(4);
    expect(user.organization_id).toBe(9);
    expect(user.role_id).toBe(2);
    expect(user.status_id).toBe(1);
  });
});