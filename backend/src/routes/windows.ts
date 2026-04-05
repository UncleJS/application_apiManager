import { Elysia, t } from "elysia";
import { db, pool } from "../db/client";
import { sql } from "drizzle-orm";
import { buildError } from "../utils/errors";
import { isFiveMinuteIncrement, isValidTime } from "../utils/time";
import { logAudit } from "../logging";
import { nowUtc } from "../utils/datetime";
import { serializeUtcFields } from "../utils/datetime";
import { requireRole } from "../middleware/requireRole";
import type { ResultSetHeader } from "mysql2/promise";
import type { AuthUser } from "../middleware/authenticate";
import { query, type QueryValue } from "../db/index";
import type { ProtectedContext } from "../types/http";

type WindowsQuery = {
  subjectType?: string;
  subjectId?: string;
};

type WindowBody = {
  subjectType: "user" | "api";
  subjectId: number;
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  isActive?: boolean;
};

type WindowParams = {
  id: string;
};

async function getSubjectOrganizationId(subjectType: "user" | "api", subjectId: number): Promise<number | null> {
  if (subjectType === "user") {
    const rows = await db.execute(sql`SELECT organization_id FROM users WHERE id = ${subjectId}`);
    const data = rows[0] as unknown as { organization_id: number }[];
    return data[0]?.organization_id ?? null;
  }

  const rows = await db.execute(sql`SELECT organization_id FROM api_definitions WHERE id = ${subjectId}`);
  const data = rows[0] as unknown as { organization_id: number }[];
  return data[0]?.organization_id ?? null;
}

async function getWindowScope(windowId: number): Promise<{ organizationId: number } | null> {
  const rows = await db.execute(
    sql`SELECT COALESCE(u.organization_id, a.organization_id) as organization_id
        FROM access_windows w
        LEFT JOIN users u ON w.subject_type = 'user' AND u.id = w.subject_id
        LEFT JOIN api_definitions a ON w.subject_type = 'api' AND a.id = w.subject_id
        WHERE w.id = ${windowId}`
  );
  const data = rows[0] as unknown as { organization_id: number }[];
  return data[0]?.organization_id ? { organizationId: data[0].organization_id } : null;
}

function ensureWindowAccess(authUser: AuthUser, organizationId: number) {
  const roleError = requireRole(["global_admin", "org_admin"])(authUser);
  if (roleError) {
    return roleError;
  }

  if (authUser.role === "org_admin" && organizationId !== authUser.organizationId) {
    return { error: buildError("FORBIDDEN", "Cannot manage windows outside your organization"), status: 403 };
  }

  return null;
}

function validateTimes(startTime?: string, endTime?: string): string | null {
  if (startTime && (!isValidTime(startTime) || !isFiveMinuteIncrement(startTime))) {
    return "Invalid start time";
  }
  if (endTime && (!isValidTime(endTime) || !isFiveMinuteIncrement(endTime))) {
    return "Invalid end time";
  }
  return null;
}

export const windowsPlugin = new Elysia({ prefix: "/windows" })
  .get("/", async (context) => {
    const { query, authUser, _authError, set } = context as unknown as ProtectedContext<WindowsQuery>;
    if (!authUser) { set.status = 401; return _authError; }
    const subjectType = query.subjectType as string | undefined;
    const subjectId = query.subjectId ? Number.parseInt(query.subjectId, 10) : Number.NaN;
    if (!subjectType || Number.isNaN(subjectId)) {
      set.status = 400;
      return buildError("INVALID_REQUEST", "subjectType and subjectId required");
    }
    if (subjectType !== "user" && subjectType !== "api") {
      set.status = 400;
      return buildError("INVALID_REQUEST", "Invalid subjectType");
    }
    const organizationId = await getSubjectOrganizationId(subjectType, subjectId);
    if (!organizationId) { set.status = 404; return buildError("NOT_FOUND", "Subject not found"); }
    const accessError = ensureWindowAccess(authUser, organizationId);
    if (accessError) { set.status = accessError.status; return accessError.error; }
    const rows = await db.execute(
      sql`SELECT id, subject_type, subject_id, day_of_week, start_time, end_time, is_active, created_at_utc FROM access_windows WHERE subject_type = ${subjectType} AND subject_id = ${subjectId}`
    );
    return serializeUtcFields({ items: rows[0] });
  })
  .post(
    "/",
    async (context) => {
      const { body, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, WindowBody>;
      if (!authUser) { set.status = 401; return _authError; }
      if (body.dayOfWeek === undefined || !body.startTime || !body.endTime) {
        set.status = 400;
        return buildError("INVALID_REQUEST", "dayOfWeek, startTime, and endTime are required");
      }
      const organizationId = await getSubjectOrganizationId(body.subjectType, body.subjectId);
      if (!organizationId) { set.status = 404; return buildError("NOT_FOUND", "Subject not found"); }
      const accessError = ensureWindowAccess(authUser, organizationId);
      if (accessError) { set.status = accessError.status; return accessError.error; }
      const timeError = validateTimes(body.startTime, body.endTime);
      if (timeError) { set.status = 400; return buildError("INVALID_TIME", timeError); }
      const now = nowUtc();
      const [result] = await pool.execute<ResultSetHeader>(
        "INSERT INTO access_windows (subject_type, subject_id, day_of_week, start_time, end_time, is_active, created_at_utc) VALUES (?, ?, ?, ?, ?, 1, ?)",
        [body.subjectType, body.subjectId, body.dayOfWeek, body.startTime, body.endTime, now] as QueryValue[]
      );
      const createdId = Number(result.insertId);
      await logAudit({
        organizationId,
        userId: authUser.id,
        actionCode: "WINDOW_CREATE",
        entityName: "window",
        entityId: createdId,
        metadata: body,
        createdAtUtc: now
      });
      set.status = 201;
      return { id: createdId };
    },
    {
      body: t.Object({
        subjectType: t.Union([t.Literal("user"), t.Literal("api")]),
        subjectId: t.Number(),
        dayOfWeek: t.Number({ minimum: 1, maximum: 7 }),
        startTime: t.String(),
        endTime: t.String()
      })
    }
  )
  .put(
    "/:id",
    async (context) => {
      const { params, body, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, WindowBody, WindowParams>;
      if (!authUser) { set.status = 401; return _authError; }
      const windowId = Number.parseInt(params.id, 10);
      if (Number.isNaN(windowId)) { set.status = 400; return buildError("INVALID_REQUEST", "Invalid window id"); }
      const scope = await getWindowScope(windowId);
      if (!scope) { set.status = 404; return buildError("NOT_FOUND", "Window not found"); }
      const accessError = ensureWindowAccess(authUser, scope.organizationId);
      if (accessError) { set.status = accessError.status; return accessError.error; }
      const timeError = validateTimes(body.startTime, body.endTime);
      if (timeError) { set.status = 400; return buildError("INVALID_TIME", timeError); }

      const updates: string[] = [];
      const values: QueryValue[] = [];
      if (body.dayOfWeek !== undefined) { updates.push("day_of_week = ?"); values.push(body.dayOfWeek); }
      if (body.startTime !== undefined) { updates.push("start_time = ?"); values.push(body.startTime); }
      if (body.endTime !== undefined) { updates.push("end_time = ?"); values.push(body.endTime); }
      if (body.isActive !== undefined) { updates.push("is_active = ?"); values.push(body.isActive ? 1 : 0); }

      if (updates.length === 0) { set.status = 400; return buildError("INVALID_REQUEST", "No updates provided"); }
      values.push(windowId);
      await query(`UPDATE access_windows SET ${updates.join(", ")} WHERE id = ?`, values);

      await logAudit({
        organizationId: scope.organizationId,
        userId: authUser.id,
        actionCode: "WINDOW_UPDATE",
        entityName: "window",
        entityId: windowId,
        metadata: body,
        createdAtUtc: nowUtc()
      });
      return { ok: true };
    },
    {
      body: t.Object({
        dayOfWeek: t.Optional(t.Number({ minimum: 1, maximum: 7 })),
        startTime: t.Optional(t.String()),
        endTime: t.Optional(t.String()),
        isActive: t.Optional(t.Boolean())
      })
    }
  )
  .post("/:id/archive", async (context) => {
    const { params, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, unknown, WindowParams>;
    if (!authUser) { set.status = 401; return _authError; }
    const windowId = Number.parseInt(params.id, 10);
    if (Number.isNaN(windowId)) { set.status = 400; return buildError("INVALID_REQUEST", "Invalid window id"); }
    const scope = await getWindowScope(windowId);
    if (!scope) { set.status = 404; return buildError("NOT_FOUND", "Window not found"); }
    const accessError = ensureWindowAccess(authUser, scope.organizationId);
    if (accessError) { set.status = accessError.status; return accessError.error; }
    await db.execute(sql`UPDATE access_windows SET is_active = 0 WHERE id = ${windowId}`);
    await logAudit({
      organizationId: scope.organizationId,
      userId: authUser.id,
      actionCode: "WINDOW_ARCHIVE",
      entityName: "window",
      entityId: windowId,
      metadata: {},
      createdAtUtc: nowUtc()
    });
    return { ok: true };
  });
