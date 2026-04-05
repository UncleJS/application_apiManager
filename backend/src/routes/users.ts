import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { hashPassword } from "../auth";
import { buildError } from "../utils/errors";
import { logAudit } from "../logging";
import { nowUtc } from "../utils/datetime";
import { serializeUtcFields } from "../utils/datetime";
import { requireRole } from "../middleware/requireRole";
import { query, type QueryValue } from "../db/index";
import type { ProtectedContext } from "../types/http";

type UserBody = {
  username?: string;
  password?: string;
  organizationId?: number;
  roleId?: number;
  statusId?: number;
};

type UserParams = {
  id: string;
};

async function getRoleName(roleId: number): Promise<string> {
  const rows = await db.execute(sql`SELECT name FROM roles WHERE id = ${roleId}`);
  const data = rows[0] as unknown as { name: string }[];
  if (!data || data.length === 0) {
    throw new Error(`Missing role ${roleId}`);
  }
  return data[0].name;
}

async function getUserOrgId(userId: number): Promise<number | null> {
  const rows = await db.execute(sql`SELECT organization_id FROM users WHERE id = ${userId}`);
  const data = rows[0] as unknown as { organization_id: number }[];
  if (!data || data.length === 0) {
    return null;
  }
  return data[0].organization_id;
}

export const usersPlugin = new Elysia({ prefix: "/users" })
  .get("/", async (context) => {
    const { authUser, _authError, set } = context as unknown as ProtectedContext;
    if (!authUser) { set.status = 401; return _authError; }
    const roleError = requireRole(["global_admin", "org_admin"])(authUser);
    if (roleError) { set.status = roleError.status; return roleError.error; }
    const rows = await db.execute(
      sql`SELECT u.id, u.username, u.organization_id, u.role_id, r.name as role_name, u.status_id, s.name as status_name, u.created_at_utc, u.updated_at_utc FROM users u JOIN roles r ON u.role_id = r.id JOIN user_statuses s ON u.status_id = s.id WHERE ${authUser.role} = 'global_admin' OR u.organization_id = ${authUser.organizationId}`
    );
    return serializeUtcFields({ items: rows[0] });
  })
  .post(
    "/",
    async (context) => {
      const { body, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, UserBody>;
      if (!authUser) { set.status = 401; return _authError; }
      const roleError = requireRole(["global_admin", "org_admin"])(authUser);
      if (roleError) { set.status = roleError.status; return roleError.error; }

      if (body.organizationId === undefined || body.roleId === undefined || !body.password) {
        set.status = 400;
        return buildError("INVALID_REQUEST", "organizationId, roleId, and password are required");
      }

      if (authUser.role === "org_admin" && body.organizationId !== authUser.organizationId) {
        set.status = 403;
        return buildError("FORBIDDEN", "Cannot create users outside your organization");
      }

      const targetOrganizationId = authUser.role === "org_admin" ? authUser.organizationId : body.organizationId;
      const targetRole = await getRoleName(body.roleId);
      if (authUser.role === "org_admin" && targetRole === "global_admin") {
        set.status = 403;
        return buildError("FORBIDDEN", "Cannot create global admins");
      }

      const statusRows = await db.execute(sql`SELECT id FROM user_statuses WHERE name = 'active'`);
      const statusId = (statusRows[0] as unknown as { id: number }[])[0]?.id;
      const now = nowUtc();
      const passwordHash = await hashPassword(body.password);
      await db.execute(
        sql`INSERT INTO users (username, password_hash, organization_id, role_id, status_id, created_at_utc, updated_at_utc) VALUES (${body.username}, ${passwordHash}, ${targetOrganizationId}, ${body.roleId}, ${statusId}, ${now}, ${now})`
      );

      const created = await db.execute(sql`SELECT id FROM users WHERE username = ${body.username}`);
      const createdId = (created[0] as unknown as { id: number }[])[0].id;

      await logAudit({
        organizationId: targetOrganizationId,
        userId: authUser.id,
        actionCode: "USER_CREATE",
        entityName: "user",
        entityId: createdId,
        metadata: { username: body.username },
        createdAtUtc: now
      });
      set.status = 201;
      return { id: createdId };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 2 }),
        password: t.String({ minLength: 8 }),
        organizationId: t.Number(),
        roleId: t.Number()
      })
    }
  )
  .put(
    "/:id",
    async (context) => {
      const { params, body, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, UserBody, UserParams>;
      if (!authUser) { set.status = 401; return _authError; }
      const roleError = requireRole(["global_admin", "org_admin"])(authUser);
      if (roleError) { set.status = roleError.status; return roleError.error; }
      const userId = Number.parseInt(params.id, 10);
      if (Number.isNaN(userId)) { set.status = 400; return buildError("INVALID_REQUEST", "Invalid user id"); }

      if (authUser.role === "org_admin") {
        const targetOrgId = await getUserOrgId(userId);
        if (!targetOrgId || targetOrgId !== authUser.organizationId) {
          set.status = 403;
          return buildError("FORBIDDEN", "Cannot edit users outside your organization");
        }
      }

      const targetOrganizationId = body.organizationId ?? await getUserOrgId(userId);
      if (!targetOrganizationId) {
        set.status = 404;
        return buildError("NOT_FOUND", "User not found");
      }

      if (authUser.role === "org_admin" && body.organizationId !== undefined) {
        set.status = 403;
        return buildError("FORBIDDEN", "Organization changes not allowed");
      }
      if (body.roleId) {
        const targetRole = await getRoleName(body.roleId);
        if (authUser.role === "org_admin" && targetRole === "global_admin") {
          set.status = 403;
          return buildError("FORBIDDEN", "Cannot assign global admin");
        }
      }

      const updates: string[] = [];
      const values: QueryValue[] = [];
      if (body.username) { updates.push("username = ?"); values.push(body.username); }
      if (body.password) {
        const passwordHash = await hashPassword(body.password);
        updates.push("password_hash = ?");
        values.push(passwordHash);
      }
      if (body.organizationId !== undefined) { updates.push("organization_id = ?"); values.push(body.organizationId); }
      if (body.roleId !== undefined) { updates.push("role_id = ?"); values.push(body.roleId); }
      if (body.statusId !== undefined) { updates.push("status_id = ?"); values.push(body.statusId); }
      if (updates.length === 0) { set.status = 400; return buildError("INVALID_REQUEST", "No updates provided"); }
      updates.push("updated_at_utc = ?");
      values.push(nowUtc());
      values.push(userId);
      await query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);

      await logAudit({
        organizationId: targetOrganizationId,
        userId: authUser.id,
        actionCode: "USER_UPDATE",
        entityName: "user",
        entityId: userId,
        metadata: body as Record<string, unknown>,
        createdAtUtc: nowUtc()
      });
      return { ok: true };
    },
    {
      body: t.Object({
        username: t.Optional(t.String({ minLength: 2 })),
        password: t.Optional(t.String({ minLength: 8 })),
        organizationId: t.Optional(t.Number()),
        roleId: t.Optional(t.Number()),
        statusId: t.Optional(t.Number())
      })
    }
  )
  .post("/:id/archive", async (context) => {
    const { params, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, unknown, UserParams>;
    if (!authUser) { set.status = 401; return _authError; }
    const roleError = requireRole(["global_admin", "org_admin"])(authUser);
    if (roleError) { set.status = roleError.status; return roleError.error; }
    const userId = Number.parseInt(params.id, 10);
    if (Number.isNaN(userId)) { set.status = 400; return buildError("INVALID_REQUEST", "Invalid user id"); }

    const targetOrganizationId = await getUserOrgId(userId);
    if (!targetOrganizationId) { set.status = 404; return buildError("NOT_FOUND", "User not found"); }

    if (authUser.role === "org_admin") {
      if (targetOrganizationId !== authUser.organizationId) {
        set.status = 403;
        return buildError("FORBIDDEN", "Cannot archive users outside your organization");
      }
    }
    const statusRows = await db.execute(sql`SELECT id FROM user_statuses WHERE name = 'archived'`);
    const statusId = (statusRows[0] as unknown as { id: number }[])[0]?.id;
    const now = nowUtc();
    await db.execute(sql`UPDATE users SET status_id = ${statusId}, updated_at_utc = ${now} WHERE id = ${userId}`);
    await logAudit({
      organizationId: targetOrganizationId,
      userId: authUser.id,
      actionCode: "USER_ARCHIVE",
      entityName: "user",
      entityId: userId,
      metadata: {},
      createdAtUtc: now
    });
    return { ok: true };
  });
