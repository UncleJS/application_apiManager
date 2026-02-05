import { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashPassword } from "../auth";
import { query } from "../db";
import { buildError } from "../utils/errors";
import { logAudit } from "../logging";
import { nowUtc } from "../utils/datetime";

const userCreateSchema = z.object({
  username: z.string().min(2),
  password: z.string().min(8),
  organizationId: z.number().int(),
  roleId: z.number().int()
});

const userUpdateSchema = z.object({
  username: z.string().min(2).optional(),
  password: z.string().min(8).optional(),
  organizationId: z.number().int().optional(),
  roleId: z.number().int().optional(),
  statusId: z.number().int().optional()
});

async function getRoleName(roleId: number): Promise<string> {
  const rows = await query<{ name: string }[]>("SELECT name FROM roles WHERE id = ?", [roleId]);
  if (!rows || rows.length === 0) {
    throw new Error(`Missing role ${roleId}`);
  }
  return rows[0].name;
}

export async function registerUserRoutes(app: FastifyInstance) {
  app.get("/users", async (request, reply) => {
    const authUser = request.authUser!;
    const rows = await query(
      "SELECT u.id, u.username, u.organization_id, u.role_id, r.name as role_name, u.status_id, s.name as status_name, u.created_at_utc, u.updated_at_utc FROM users u JOIN roles r ON u.role_id = r.id JOIN user_statuses s ON u.status_id = s.id WHERE ? = 'global_admin' OR u.organization_id = ?",
      [authUser.role, authUser.organizationId]
    );
    return reply.send({ items: rows });
  });

  app.post("/users", async (request, reply) => {
    const authUser = request.authUser!;
    const parseResult = userCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid user payload"));
    }

    if (authUser.role === "org_admin" && parseResult.data.organizationId !== authUser.organizationId) {
      return reply.status(403).send(buildError("FORBIDDEN", "Cannot create users outside your organization"));
    }

    const targetRole = await getRoleName(parseResult.data.roleId);
    if (authUser.role === "org_admin" && targetRole === "global_admin") {
      return reply.status(403).send(buildError("FORBIDDEN", "Cannot create global admins"));
    }

    const statusIdRows = await query<{ id: number }[]>("SELECT id FROM user_statuses WHERE name = 'active'");
    const statusId = statusIdRows[0]?.id;
    const now = nowUtc();
    const passwordHash = await hashPassword(parseResult.data.password);
    await query(
      "INSERT INTO users (username, password_hash, organization_id, role_id, status_id, created_at_utc, updated_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        parseResult.data.username,
        passwordHash,
        parseResult.data.organizationId,
        parseResult.data.roleId,
        statusId,
        now,
        now
      ]
    );

    const created = await query<{ id: number }[]>("SELECT id FROM users WHERE username = ?", [parseResult.data.username]);
    const createdId = created[0].id;

    await logAudit({
      organizationId: parseResult.data.organizationId,
      userId: authUser.id,
      actionCode: "USER_CREATE",
      entityName: "user",
      entityId: createdId,
      metadata: { username: parseResult.data.username },
      createdAtUtc: now
    });

    return reply.status(201).send({ id: createdId });
  });

  app.put("/users/:id", async (request, reply) => {
    const authUser = request.authUser!;
    const parseResult = userUpdateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid user payload"));
    }

    const userId = Number.parseInt((request.params as any).id, 10);
    if (Number.isNaN(userId)) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid user id"));
    }

    if (authUser.role === "org_admin" && parseResult.data.organizationId && parseResult.data.organizationId !== authUser.organizationId) {
      return reply.status(403).send(buildError("FORBIDDEN", "Cannot move users outside your organization"));
    }

    if (parseResult.data.roleId) {
      const targetRole = await getRoleName(parseResult.data.roleId);
      if (authUser.role === "org_admin" && targetRole === "global_admin") {
        return reply.status(403).send(buildError("FORBIDDEN", "Cannot assign global admin"));
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    if (parseResult.data.username) {
      updates.push("username = ?");
      values.push(parseResult.data.username);
    }
    if (parseResult.data.password) {
      const passwordHash = await hashPassword(parseResult.data.password);
      updates.push("password_hash = ?");
      values.push(passwordHash);
    }
    if (parseResult.data.organizationId) {
      updates.push("organization_id = ?");
      values.push(parseResult.data.organizationId);
    }
    if (parseResult.data.roleId) {
      updates.push("role_id = ?");
      values.push(parseResult.data.roleId);
    }
    if (parseResult.data.statusId) {
      updates.push("status_id = ?");
      values.push(parseResult.data.statusId);
    }

    updates.push("updated_at_utc = ?");
    values.push(nowUtc());

    values.push(userId);
    await query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);

    await logAudit({
      organizationId: authUser.organizationId,
      userId: authUser.id,
      actionCode: "USER_UPDATE",
      entityName: "user",
      entityId: userId,
      metadata: parseResult.data,
      createdAtUtc: nowUtc()
    });

    return reply.send({ ok: true });
  });

  app.post("/users/:id/archive", async (request, reply) => {
    const userId = Number.parseInt((request.params as any).id, 10);
    if (Number.isNaN(userId)) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid user id"));
    }
    const statusIdRows = await query<{ id: number }[]>("SELECT id FROM user_statuses WHERE name = 'archived'");
    const statusId = statusIdRows[0]?.id;
    const now = nowUtc();
    await query("UPDATE users SET status_id = ?, updated_at_utc = ? WHERE id = ?", [statusId, now, userId]);

    await logAudit({
      organizationId: request.authUser!.organizationId,
      userId: request.authUser!.id,
      actionCode: "USER_ARCHIVE",
      entityName: "user",
      entityId: userId,
      metadata: {},
      createdAtUtc: now
    });

    return reply.send({ ok: true });
  });
}
