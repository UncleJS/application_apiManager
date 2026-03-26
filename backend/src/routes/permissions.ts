import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { buildError } from "../utils/errors";
import { logAudit } from "../logging";
import { nowUtc } from "../utils/datetime";
import { requireRole } from "../middleware/requireRole";
import type { ProtectedContext } from "../types/http";

type PermissionsQuery = {
  userId?: string;
};

type PermissionBody = {
  userId: number;
  apiId: number;
};

async function ensureSameOrg(userId: number, apiId: number): Promise<boolean> {
  const rows = await db.execute(
    sql`SELECT u.organization_id as userOrg, a.organization_id as apiOrg FROM users u JOIN api_definitions a ON a.id = ${apiId} WHERE u.id = ${userId}`
  );
  const data = rows[0] as unknown as { userOrg: number; apiOrg: number }[];
  if (!data || data.length === 0) {
    return false;
  }
  return data[0].userOrg === data[0].apiOrg;
}

async function getUserOrganizationId(userId: number): Promise<number | null> {
  const rows = await db.execute(sql`SELECT organization_id FROM users WHERE id = ${userId}`);
  const data = rows[0] as unknown as { organization_id: number }[];
  return data[0]?.organization_id ?? null;
}

export const permissionsPlugin = new Elysia({ prefix: "/permissions" })
  .get("/", async (context) => {
    const { query, authUser, _authError, set } = context as unknown as ProtectedContext<PermissionsQuery>;
    if (!authUser) { set.status = 401; return _authError; }
    const roleError = requireRole(["global_admin", "org_admin"])(authUser);
    if (roleError) { set.status = roleError.status; return roleError.error; }
    if (!query.userId) { set.status = 400; return buildError("INVALID_REQUEST", "userId required"); }
    const userId = Number.parseInt(query.userId, 10);
    if (Number.isNaN(userId)) { set.status = 400; return buildError("INVALID_REQUEST", "userId required"); }
    const userOrgId = await getUserOrganizationId(userId);
    if (!userOrgId) { set.status = 404; return buildError("NOT_FOUND", "User not found"); }
    if (authUser.role === "org_admin" && userOrgId !== authUser.organizationId) {
      set.status = 403;
      return buildError("FORBIDDEN", "Cannot view permissions outside your organization");
    }
    const rows = await db.execute(sql`SELECT api_id FROM user_api_permissions WHERE user_id = ${userId}`);
    const data = rows[0] as unknown as { api_id: number }[];
    return { items: data.map((row) => row.api_id) };
  })
  .post(
    "/assign",
    async (context) => {
      const { body, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, PermissionBody>;
      if (!authUser) { set.status = 401; return _authError; }
      const roleError = requireRole(["global_admin", "org_admin"])(authUser);
      if (roleError) { set.status = roleError.status; return roleError.error; }
      const sameOrg = await ensureSameOrg(body.userId, body.apiId);
      if (!sameOrg) { set.status = 403; return buildError("FORBIDDEN", "Cannot assign across organizations"); }
      const userOrgId = await getUserOrganizationId(body.userId);
      if (!userOrgId) { set.status = 404; return buildError("NOT_FOUND", "User not found"); }
      if (authUser.role === "org_admin" && userOrgId !== authUser.organizationId) {
        set.status = 403;
        return buildError("FORBIDDEN", "Cannot assign permissions outside your organization");
      }
      const now = nowUtc();
      await db.execute(
        sql`INSERT IGNORE INTO user_api_permissions (user_id, api_id, created_at_utc) VALUES (${body.userId}, ${body.apiId}, ${now})`
      );
      await logAudit({
        organizationId: authUser.organizationId,
        userId: authUser.id,
        actionCode: "PERMISSION_ASSIGN",
        entityName: "permission",
        entityId: body.apiId,
        metadata: body,
        createdAtUtc: now
      });
      return { ok: true };
    },
    { body: t.Object({ userId: t.Number(), apiId: t.Number() }) }
  )
  .post(
    "/unassign",
    async (context) => {
      const { body, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, PermissionBody>;
      if (!authUser) { set.status = 401; return _authError; }
      const roleError = requireRole(["global_admin", "org_admin"])(authUser);
      if (roleError) { set.status = roleError.status; return roleError.error; }
      const sameOrg = await ensureSameOrg(body.userId, body.apiId);
      if (!sameOrg) { set.status = 403; return buildError("FORBIDDEN", "Cannot unassign across organizations"); }
      const userOrgId = await getUserOrganizationId(body.userId);
      if (!userOrgId) { set.status = 404; return buildError("NOT_FOUND", "User not found"); }
      if (authUser.role === "org_admin" && userOrgId !== authUser.organizationId) {
        set.status = 403;
        return buildError("FORBIDDEN", "Cannot unassign permissions outside your organization");
      }
      await db.execute(
        sql`DELETE FROM user_api_permissions WHERE user_id = ${body.userId} AND api_id = ${body.apiId}`
      );
      await logAudit({
        organizationId: authUser.organizationId,
        userId: authUser.id,
        actionCode: "PERMISSION_UNASSIGN",
        entityName: "permission",
        entityId: body.apiId,
        metadata: body,
        createdAtUtc: nowUtc()
      });
      return { ok: true };
    },
    { body: t.Object({ userId: t.Number(), apiId: t.Number() }) }
  );
