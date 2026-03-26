import { Elysia } from "elysia";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { buildError } from "../utils/errors";
import { revokeSession } from "../sessions";
import { requireRole } from "../middleware/requireRole";
import { query as dbQuery, type QueryValue } from "../db/index";
import type { ProtectedContext } from "../types/http";

type SessionsQuery = {
  userId?: string;
  orgId?: string;
};

type SessionParams = {
  id: string;
};

type SessionRow = {
  id: number | string;
  user_id: number | string;
  username: string;
  organization_id: number | string;
  organization_name: string;
  role: string;
  created_at_utc: string;
  last_activity_utc: string;
  expires_at_utc: string;
  revoked_at_utc: string | null;
  user_agent: string | null;
  client_ip: string | null;
};

export const sessionsPlugin = new Elysia({ prefix: "/sessions" })
  .get("/", async (context) => {
    const { query, authUser, _authError, set } = context as unknown as ProtectedContext<SessionsQuery>;
    if (!authUser) { set.status = 401; return _authError; }
    const roleError = requireRole(["global_admin", "org_admin"])(authUser);
    if (roleError) { set.status = roleError.status; return roleError.error; }
    const userIdRaw = query?.userId;
    const orgIdRaw = query?.orgId;
    const userId = userIdRaw ? Number.parseInt(userIdRaw, 10) : null;
    const orgId = orgIdRaw ? Number.parseInt(orgIdRaw, 10) : null;
    if (userIdRaw && Number.isNaN(userId)) { set.status = 400; return buildError("INVALID_REQUEST", "Invalid userId"); }
    if (orgIdRaw && Number.isNaN(orgId)) { set.status = 400; return buildError("INVALID_REQUEST", "Invalid orgId"); }

    const conditions: string[] = ["1=1"];
    const params: QueryValue[] = [];
    if (authUser.role !== "global_admin") {
      conditions.push("u.organization_id = ?");
      params.push(authUser.organizationId);
    } else if (orgId) {
      conditions.push("u.organization_id = ?");
      params.push(orgId);
    }
    if (userId) {
      conditions.push("s.user_id = ?");
      params.push(userId);
    }

    const where = conditions.join(" AND ");
    const rows = await dbQuery<SessionRow[]>(
      `SELECT s.id, s.user_id, u.username, u.organization_id, o.name as organization_name, r.name as role, s.created_at_utc, s.last_activity_utc, s.expires_at_utc, s.revoked_at_utc, s.user_agent, s.client_ip
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       JOIN organizations o ON u.organization_id = o.id
       JOIN roles r ON u.role_id = r.id
       WHERE ${where}
       ORDER BY s.last_activity_utc DESC`,
      params
    );

    const items = rows.map((row: SessionRow) => ({
      ...row,
      id: Number(row.id),
      user_id: Number(row.user_id),
      organization_id: Number(row.organization_id)
    }));

    return { items };
  })
  .post("/:id/revoke", async (context) => {
    const { params, authUser, _authError, set } = context as unknown as ProtectedContext<Record<string, unknown>, unknown, SessionParams>;
    if (!authUser) { set.status = 401; return _authError; }
    const roleError = requireRole(["global_admin", "org_admin"])(authUser);
    if (roleError) { set.status = roleError.status; return roleError.error; }
    const sessionId = Number.parseInt(params.id, 10);
    if (Number.isNaN(sessionId)) { set.status = 400; return buildError("INVALID_REQUEST", "Invalid session id"); }

    const rows = await db.execute(
      sql`SELECT u.organization_id FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ${sessionId}`
    );
    const data = rows[0] as unknown as { organization_id: number }[];

    if (!data || data.length === 0) { set.status = 404; return buildError("NOT_FOUND", "Session not found"); }

    if (authUser.role !== "global_admin" && data[0].organization_id !== authUser.organizationId) {
      set.status = 403;
      return buildError("FORBIDDEN", "Cannot revoke sessions outside your organization");
    }

    await revokeSession(sessionId);
    return { ok: true };
  });
