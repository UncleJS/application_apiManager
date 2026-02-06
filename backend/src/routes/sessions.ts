import { FastifyInstance } from "fastify";
import { query } from "../db";
import { buildError } from "../utils/errors";
import { revokeSession } from "../sessions";

export async function registerSessionRoutes(app: FastifyInstance) {
  app.get("/sessions", async (request, reply) => {
    const authUser = request.authUser!;
    const userIdRaw = (request.query as any)?.userId;
    const orgIdRaw = (request.query as any)?.orgId;
    const userId = userIdRaw ? Number.parseInt(userIdRaw, 10) : null;
    const orgId = orgIdRaw ? Number.parseInt(orgIdRaw, 10) : null;
    if (userIdRaw && Number.isNaN(userId)) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid userId"));
    }
    if (orgIdRaw && Number.isNaN(orgId)) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid orgId"));
    }

    const params: any[] = [];
    let where = "WHERE 1=1";
    if (authUser.role !== "global_admin") {
      where += " AND u.organization_id = ?";
      params.push(authUser.organizationId);
    } else if (orgId) {
      where += " AND u.organization_id = ?";
      params.push(orgId);
    }
    if (userId) {
      where += " AND s.user_id = ?";
      params.push(userId);
    }

    const rows = await query(
      `SELECT s.id, s.user_id, u.username, u.organization_id, o.name as organization_name, r.name as role, s.created_at_utc, s.last_activity_utc, s.expires_at_utc, s.revoked_at_utc, s.user_agent, s.client_ip
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       JOIN organizations o ON u.organization_id = o.id
       JOIN roles r ON u.role_id = r.id
       ${where}
       ORDER BY s.last_activity_utc DESC`,
      params
    );

    const items = rows.map((row: any) => ({
      ...row,
      id: Number(row.id),
      user_id: Number(row.user_id),
      organization_id: Number(row.organization_id)
    }));

    return reply.send({ items });
  });

  app.post("/sessions/:id/revoke", async (request, reply) => {
    const authUser = request.authUser!;
    const sessionId = Number.parseInt((request.params as any).id, 10);
    if (Number.isNaN(sessionId)) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid session id"));
    }

    const rows = await query<{ organization_id: number }[]>(
      "SELECT u.organization_id FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ?",
      [sessionId]
    );

    if (!rows || rows.length === 0) {
      return reply.status(404).send(buildError("NOT_FOUND", "Session not found"));
    }

    if (authUser.role !== "global_admin" && rows[0].organization_id !== authUser.organizationId) {
      return reply.status(403).send(buildError("FORBIDDEN", "Cannot revoke sessions outside your organization"));
    }

    await revokeSession(sessionId);
    return reply.send({ ok: true });
  });
}
