import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { buildError } from "../utils/errors";
import { logAudit } from "../logging";
import { nowUtc } from "../utils/datetime";
import { serializeUtcFields } from "../utils/datetime";
import { requireRole } from "../middleware/requireRole";
import { assertSafeTargetUrl } from "../utils/network";
import { query, type QueryValue } from "../db/index";
import type { ProtectedContext } from "../types/http";
import { ApiList, OkResponse, IdResponse, ErrorResponse, authErrors } from "../schemas/responses";

const RESERVED_BASE_PATHS = [
  "/auth",
  "/orgs",
  "/users",
  "/apis",
  "/permissions",
  "/windows",
  "/reports",
  "/sessions",
  "/lookups",
  "/docs",
  "/openapi.json",
  "/healthz",
  "/login"
];

type CreateApiBody = {
  organizationId: number;
  name: string;
  basePath: string;
  targetUrl: string;
  isPublic: boolean;
  isEnabled?: boolean;
  alwaysOn?: boolean;
};

type UpdateApiBody = {
  name?: string;
  organizationId?: number;
  basePath?: string;
  targetUrl?: string;
  isPublic?: boolean;
  isEnabled?: boolean;
  alwaysOn?: boolean;
};

type ApiParams = {
  id: string;
};

async function getApiOrganizationId(apiId: number): Promise<number | null> {
  const rows = await db.execute(sql`SELECT organization_id FROM api_definitions WHERE id = ${apiId}`);
  const data = rows[0] as unknown as { organization_id: number }[];
  return data[0]?.organization_id ?? null;
}

function isDuplicateEntryError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
}

function validateBasePath(basePath: string): string | null {
  if (!basePath.startsWith("/")) {
    return "Base path must start with /";
  }

  if (basePath === "/") {
    return "Base path / is not allowed";
  }

  if (RESERVED_BASE_PATHS.some((reserved) => basePath === reserved || basePath.startsWith(`${reserved}/`))) {
    return "Base path overlaps with a reserved internal route";
  }

  return null;
}

export const apisPlugin = new Elysia({ prefix: "/apis" })
  .get("/", async (context) => {
    const { authUser, _authError, set } = context as unknown as ProtectedContext;
    if (!authUser) { set.status = 401; return _authError; }
    if (authUser.role === "global_admin") {
      const rows = await db.execute(
        sql`SELECT a.*, o.name as organization_name FROM api_definitions a JOIN organizations o ON a.organization_id = o.id`
      );
      return serializeUtcFields({ items: rows[0] });
    }
    if (authUser.role === "org_admin") {
      const rows = await db.execute(
        sql`SELECT a.*, o.name as organization_name FROM api_definitions a JOIN organizations o ON a.organization_id = o.id WHERE a.organization_id = ${authUser.organizationId}`
      );
      return serializeUtcFields({ items: rows[0] });
    }
    const rows = await db.execute(
      sql`SELECT DISTINCT a.*, o.name as organization_name FROM api_definitions a JOIN organizations o ON a.organization_id = o.id LEFT JOIN user_api_permissions p ON a.id = p.api_id WHERE a.organization_id = ${authUser.organizationId} AND (a.is_public = 1 OR p.user_id = ${authUser.id})`
    );
    return serializeUtcFields({ items: rows[0] });
  }, { response: { 200: ApiList, ...authErrors } })
  .post(
    "/",
    async (context) => {
      const { body, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, CreateApiBody>;
      if (!authUser) { set.status = 401; return _authError; }
      const roleError = requireRole(["global_admin", "org_admin"])(authUser);
      if (roleError) { set.status = roleError.status; return roleError.error; }
      if (authUser.role === "org_admin" && body.organizationId !== authUser.organizationId) {
        set.status = 403;
        return buildError("FORBIDDEN", "Cannot create APIs outside your organization");
      }
      const basePathError = validateBasePath(body.basePath);
      if (basePathError) {
        set.status = 400;
        return buildError("INVALID_REQUEST", basePathError);
      }
      const safeTarget = await assertSafeTargetUrl(body.targetUrl);
      if (!safeTarget.ok) {
        set.status = 400;
        return buildError("INVALID_REQUEST", safeTarget.message);
      }
      const now = nowUtc();
      try {
        await db.execute(
          sql`INSERT INTO api_definitions (organization_id, name, base_path, target_url, is_public, is_enabled, always_on, created_at_utc, updated_at_utc) VALUES (${body.organizationId}, ${body.name}, ${body.basePath}, ${body.targetUrl}, ${body.isPublic ? 1 : 0}, ${body.isEnabled === false ? 0 : 1}, ${body.alwaysOn ? 1 : 0}, ${now}, ${now})`
        );
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          set.status = 409;
          return buildError("CONFLICT", "Base path already exists");
        }
        throw error;
      }

      const created = await db.execute(
        sql`SELECT id FROM api_definitions WHERE organization_id = ${body.organizationId} AND base_path = ${body.basePath}`
      );
      const createdId = (created[0] as unknown as { id: number }[])[0].id;
      await logAudit({
        organizationId: body.organizationId,
        userId: authUser.id,
        actionCode: "API_CREATE",
        entityName: "api",
        entityId: createdId,
        metadata: { name: body.name },
        createdAtUtc: now
      });
      set.status = 201;
      return { id: createdId };
    },
    {
      body: t.Object({
        organizationId: t.Number(),
        name: t.String({ minLength: 2 }),
        basePath: t.String({ minLength: 2 }),
        targetUrl: t.String({ format: "uri" }),
        isPublic: t.Boolean(),
        isEnabled: t.Optional(t.Boolean()),
        alwaysOn: t.Optional(t.Boolean())
      }),
      response: { 201: IdResponse, 400: ErrorResponse, 409: ErrorResponse, ...authErrors }
    }
  )
  .put(
    "/:id",
    async (context) => {
      const { params, body, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, UpdateApiBody, ApiParams>;
      if (!authUser) { set.status = 401; return _authError; }
      const roleError = requireRole(["global_admin", "org_admin"])(authUser);
      if (roleError) { set.status = roleError.status; return roleError.error; }
      const apiId = Number.parseInt(params.id, 10);
      if (Number.isNaN(apiId)) { set.status = 400; return buildError("INVALID_REQUEST", "Invalid API id"); }

      const targetOrgId = await getApiOrganizationId(apiId);
      if (!targetOrgId) {
        set.status = 404;
        return buildError("NOT_FOUND", "API not found");
      }

      if (authUser.role === "org_admin" && targetOrgId !== authUser.organizationId) {
        set.status = 403;
        return buildError("FORBIDDEN", "Cannot edit APIs outside your organization");
      }

      if (authUser.role === "org_admin" && body.organizationId && body.organizationId !== authUser.organizationId) {
        set.status = 403;
        return buildError("FORBIDDEN", "Cannot move APIs outside your organization");
      }

      if (body.basePath !== undefined) {
        const basePathError = validateBasePath(body.basePath);
        if (basePathError) {
          set.status = 400;
          return buildError("INVALID_REQUEST", basePathError);
        }
      }

      if (body.targetUrl !== undefined) {
        const safeTarget = await assertSafeTargetUrl(body.targetUrl);
        if (!safeTarget.ok) {
          set.status = 400;
          return buildError("INVALID_REQUEST", safeTarget.message);
        }
      }

      const updates: string[] = [];
      const values: QueryValue[] = [];
      if (body.name) { updates.push("name = ?"); values.push(body.name); }
      if (body.basePath) { updates.push("base_path = ?"); values.push(body.basePath); }
      if (body.targetUrl) { updates.push("target_url = ?"); values.push(body.targetUrl); }
      if (body.isPublic !== undefined) { updates.push("is_public = ?"); values.push(body.isPublic ? 1 : 0); }
      if (body.isEnabled !== undefined) { updates.push("is_enabled = ?"); values.push(body.isEnabled ? 1 : 0); }
      if (body.alwaysOn !== undefined) { updates.push("always_on = ?"); values.push(body.alwaysOn ? 1 : 0); }
      if (body.organizationId !== undefined) { updates.push("organization_id = ?"); values.push(body.organizationId); }
      if (updates.length === 0) { set.status = 400; return buildError("INVALID_REQUEST", "No updates provided"); }
      updates.push("updated_at_utc = ?");
      values.push(nowUtc());
      values.push(apiId);
      try {
        await query(`UPDATE api_definitions SET ${updates.join(", ")} WHERE id = ?`, values);
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          set.status = 409;
          return buildError("CONFLICT", "Base path already exists");
        }
        throw error;
      }

      await logAudit({
        organizationId: body.organizationId ?? targetOrgId,
        userId: authUser.id,
        actionCode: "API_UPDATE",
        entityName: "api",
        entityId: apiId,
        metadata: body as Record<string, unknown>,
        createdAtUtc: nowUtc()
      });
      return { ok: true };
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 2 })),
        basePath: t.Optional(t.String({ minLength: 2 })),
        targetUrl: t.Optional(t.String({ format: "uri" })),
        isPublic: t.Optional(t.Boolean()),
        isEnabled: t.Optional(t.Boolean()),
        alwaysOn: t.Optional(t.Boolean()),
        organizationId: t.Optional(t.Number())
      }),
      response: { 200: OkResponse, 400: ErrorResponse, 404: ErrorResponse, 409: ErrorResponse, ...authErrors }
    }
  )
  .post("/:id/archive", async (context) => {
    const { params, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, unknown, ApiParams>;
    if (!authUser) { set.status = 401; return _authError; }
    const roleError = requireRole(["global_admin", "org_admin"])(authUser);
    if (roleError) { set.status = roleError.status; return roleError.error; }
    const apiId = Number.parseInt(params.id, 10);
    if (Number.isNaN(apiId)) { set.status = 400; return buildError("INVALID_REQUEST", "Invalid API id"); }
    const targetOrgId = await getApiOrganizationId(apiId);
    if (!targetOrgId) { set.status = 404; return buildError("NOT_FOUND", "API not found"); }
    if (authUser.role === "org_admin" && targetOrgId !== authUser.organizationId) {
      set.status = 403;
      return buildError("FORBIDDEN", "Cannot archive APIs outside your organization");
    }
    const now = nowUtc();
    await db.execute(sql`UPDATE api_definitions SET is_enabled = 0, updated_at_utc = ${now} WHERE id = ${apiId}`);
    await logAudit({
      organizationId: targetOrgId,
      userId: authUser.id,
      actionCode: "API_ARCHIVE",
      entityName: "api",
      entityId: apiId,
      metadata: {},
      createdAtUtc: now
    });
    return { ok: true };
  }, { response: { 200: OkResponse, 400: ErrorResponse, 404: ErrorResponse, ...authErrors } });
