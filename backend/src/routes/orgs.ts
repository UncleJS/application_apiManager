import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { buildError } from "../utils/errors";
import { logAudit } from "../logging";
import { nowUtc } from "../utils/datetime";
import { serializeUtcFields } from "../utils/datetime";
import { requireRole } from "../middleware/requireRole";
import { query, type QueryValue } from "../db/index";
import { resolveListLimit } from "../utils/listLimit";
import type { ProtectedContext } from "../types/http";
import { OrgList, OkResponse, IdResponse, ErrorResponse, authErrors } from "../schemas/responses";

type OrgBody = {
  name?: string;
  statusId?: number;
};

type OrgParams = {
  id: string;
};

function isDuplicateEntryError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
}

async function getStatusId(name: string): Promise<number> {
  const rows = await db.execute(sql`SELECT id FROM organization_statuses WHERE name = ${name}`);
  const data = rows[0] as unknown as { id: number }[];
  if (!data || data.length === 0) {
    throw new Error(`Missing organization status ${name}`);
  }
  return data[0].id;
}

export const orgsPlugin = new Elysia({ prefix: "/orgs" })
  .get("/", async (context) => {
    const { authUser, _authError, set } = context as unknown as ProtectedContext;
    if (!authUser) { set.status = 401; return _authError; }
    const roleError = requireRole(["global_admin", "org_admin"])(authUser);
    if (roleError) { set.status = roleError.status; return roleError.error; }

    const limit = resolveListLimit((context as unknown as ProtectedContext<{ limit?: string }>).query?.limit);
    const rows = authUser.role === "global_admin"
      ? await db.execute(
        sql`SELECT o.id, o.name, o.status_id, s.name as status_name, o.created_at_utc, o.updated_at_utc FROM organizations o JOIN organization_statuses s ON o.status_id = s.id ORDER BY o.id ASC LIMIT ${limit}`
      )
      : await db.execute(
        sql`SELECT o.id, o.name, o.status_id, s.name as status_name, o.created_at_utc, o.updated_at_utc FROM organizations o JOIN organization_statuses s ON o.status_id = s.id WHERE o.id = ${authUser.organizationId} ORDER BY o.id ASC LIMIT ${limit}`
      );

    return serializeUtcFields({ items: rows[0] });
  }, { response: { 200: OrgList, ...authErrors } })
  .post(
    "/",
    async (context) => {
      const { body, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, OrgBody>;
      if (!authUser) { set.status = 401; return _authError; }
      const roleError = requireRole(["global_admin"])(authUser);
      if (roleError) { set.status = roleError.status; return roleError.error; }
      const statusId = await getStatusId("active");
      const now = nowUtc();
      try {
        await db.execute(
          sql`INSERT INTO organizations (name, status_id, created_at_utc, updated_at_utc) VALUES (${body.name}, ${statusId}, ${now}, ${now})`
        );
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          set.status = 409;
          return buildError("CONFLICT", "Organization name already exists");
        }
        throw error;
      }
      const created = await db.execute(sql`SELECT id FROM organizations WHERE name = ${body.name}`);
      const createdId = (created[0] as unknown as { id: number }[])[0].id;
      await logAudit({
        organizationId: createdId,
        userId: authUser.id,
        actionCode: "ORG_CREATE",
        entityName: "org",
        entityId: createdId,
        metadata: { name: body.name },
        createdAtUtc: now
      });
      set.status = 201;
      return { id: createdId };
    },
    {
      body: t.Object({ name: t.String({ minLength: 2 }) }),
      response: { 201: IdResponse, 400: ErrorResponse, 409: ErrorResponse, ...authErrors }
    }
  )
  .put(
    "/:id",
    async (context) => {
      const { params, body, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, OrgBody, OrgParams>;
      if (!authUser) { set.status = 401; return _authError; }
      const roleError = requireRole(["global_admin"])(authUser);
      if (roleError) { set.status = roleError.status; return roleError.error; }
      const orgId = Number.parseInt(params.id, 10);
      if (Number.isNaN(orgId)) { set.status = 400; return buildError("INVALID_REQUEST", "Invalid organization id"); }

      const updates: string[] = [];
      const values: QueryValue[] = [];
      if (body.name) { updates.push("name = ?"); values.push(body.name); }
      if (body.statusId) { updates.push("status_id = ?"); values.push(body.statusId); }
      updates.push("updated_at_utc = ?");
      values.push(nowUtc());

      if (updates.length === 1) { set.status = 400; return buildError("INVALID_REQUEST", "No updates provided"); }

      values.push(orgId);
      try {
        await query(`UPDATE organizations SET ${updates.join(", ")} WHERE id = ?`, values);
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          set.status = 409;
          return buildError("CONFLICT", "Organization name already exists");
        }
        throw error;
      }

      await logAudit({
        organizationId: orgId,
        userId: authUser.id,
        actionCode: "ORG_UPDATE",
        entityName: "org",
        entityId: orgId,
        metadata: body as Record<string, unknown>,
        createdAtUtc: nowUtc()
      });
      return { ok: true };
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 2 })),
        statusId: t.Optional(t.Number())
      }),
      response: { 200: OkResponse, 400: ErrorResponse, 409: ErrorResponse, ...authErrors }
    }
  )
  .post("/:id/archive", async (context) => {
    const { params, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, unknown, OrgParams>;
    if (!authUser) { set.status = 401; return _authError; }
    const roleError = requireRole(["global_admin"])(authUser);
    if (roleError) { set.status = roleError.status; return roleError.error; }
    const orgId = Number.parseInt(params.id, 10);
    if (Number.isNaN(orgId)) { set.status = 400; return buildError("INVALID_REQUEST", "Invalid organization id"); }
    const statusId = await getStatusId("archived");
    const now = nowUtc();
    await db.execute(sql`UPDATE organizations SET status_id = ${statusId}, updated_at_utc = ${now} WHERE id = ${orgId}`);
    await logAudit({
      organizationId: orgId,
      userId: authUser.id,
      actionCode: "ORG_ARCHIVE",
      entityName: "org",
      entityId: orgId,
      metadata: {},
      createdAtUtc: now
    });
    return { ok: true };
  }, { response: { 200: OkResponse, 400: ErrorResponse, ...authErrors } })
  .post("/:id/unarchive", async (context) => {
    const { params, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, unknown, OrgParams>;
    if (!authUser) { set.status = 401; return _authError; }
    const roleError = requireRole(["global_admin"])(authUser);
    if (roleError) { set.status = roleError.status; return roleError.error; }
    const orgId = Number.parseInt(params.id, 10);
    if (Number.isNaN(orgId)) { set.status = 400; return buildError("INVALID_REQUEST", "Invalid organization id"); }
    const statusId = await getStatusId("active");
    const now = nowUtc();
    await db.execute(sql`UPDATE organizations SET status_id = ${statusId}, updated_at_utc = ${now} WHERE id = ${orgId}`);
    await logAudit({
      organizationId: orgId,
      userId: authUser.id,
      actionCode: "ORG_UNARCHIVE",
      entityName: "org",
      entityId: orgId,
      metadata: {},
      createdAtUtc: now
    });
    return { ok: true };
  }, { response: { 200: OkResponse, 400: ErrorResponse, ...authErrors } });
