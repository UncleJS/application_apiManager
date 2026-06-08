import { describe, expect, test } from "bun:test";
import { requireRole } from "./requireRole";
import type { AuthUser } from "./authenticate";

const user = (role: string): AuthUser => ({
  id: 1,
  role,
  organizationId: 1,
  username: "u"
});

describe("requireRole", () => {
  test("null user → 401 AUTH_REQUIRED", () => {
    const result = requireRole(["global_admin"])(null);
    expect(result?.status).toBe(401);
    expect(result?.error.code).toBe("AUTH_REQUIRED");
  });

  test("allowed role → null (passes)", () => {
    expect(requireRole(["global_admin"])(user("global_admin"))).toBeNull();
  });

  test("disallowed role → 403 FORBIDDEN", () => {
    const result = requireRole(["global_admin"])(user("org_admin"));
    expect(result?.status).toBe(403);
    expect(result?.error.code).toBe("FORBIDDEN");
  });

  test("multi-role allow list admits any listed role", () => {
    const guard = requireRole(["global_admin", "org_admin"]);
    expect(guard(user("global_admin"))).toBeNull();
    expect(guard(user("org_admin"))).toBeNull();
    expect(guard(user("viewer"))?.status).toBe(403);
  });

  test("role matching is exact (normalized form expected)", () => {
    // authenticate normalizes to snake_case lowercase; guard must receive that form
    expect(requireRole(["global_admin"])(user("Global Admin"))?.status).toBe(403);
  });
});
