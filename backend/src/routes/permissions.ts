import { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../db";
import { buildError } from "../utils/errors";
import { logAudit } from "../logging";
import { nowUtc } from "../utils/datetime";

const permissionSchema = z.object({
  userId: z.number().int(),
  apiId: z.number().int()
});

async function ensureSameOrg(userId: number, apiId: number): Promise<boolean> {
  const rows = await query<any[]>(
    "SELECT u.organization_id as userOrg, a.organization_id as apiOrg FROM users u JOIN api_definitions a ON a.id = ? WHERE u.id = ?",
    [apiId, userId]
  );
  if (!rows || rows.length === 0) {
    return false;
  }
  return rows[0].userOrg === rows[0].apiOrg;
}

export async function registerPermissionRoutes(app: FastifyInstance) {
  app.get("/permissions", async (request, reply) => {
    const userId = Number.parseInt((request.query as any).userId, 10);
    if (Number.isNaN(userId)) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "userId required"));
    }
    const rows = await query<{ api_id: number }[]>("SELECT api_id FROM user_api_permissions WHERE user_id = ?", [userId]);
    return reply.send({ items: rows.map((row) => row.api_id) });
  });

  app.post("/permissions/assign", async (request, reply) => {
    const authUser = request.authUser!;
    const parseResult = permissionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid permission payload"));
    }

    const sameOrg = await ensureSameOrg(parseResult.data.userId, parseResult.data.apiId);
    if (!sameOrg) {
      return reply.status(403).send(buildError("FORBIDDEN", "Cannot assign across organizations"));
    }

    const now = nowUtc();
    await query(
      "INSERT IGNORE INTO user_api_permissions (user_id, api_id, created_at_utc) VALUES (?, ?, ?)",
      [parseResult.data.userId, parseResult.data.apiId, now]
    );

    await logAudit({
      organizationId: authUser.organizationId,
      userId: authUser.id,
      actionCode: "PERMISSION_ASSIGN",
      entityName: "permission",
      entityId: parseResult.data.apiId,
      metadata: parseResult.data,
      createdAtUtc: now
    });

    return reply.send({ ok: true });
  });

  app.post("/permissions/unassign", async (request, reply) => {
    const authUser = request.authUser!;
    const parseResult = permissionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid permission payload"));
    }

    await query("DELETE FROM user_api_permissions WHERE user_id = ? AND api_id = ?", [parseResult.data.userId, parseResult.data.apiId]);

    await logAudit({
      organizationId: authUser.organizationId,
      userId: authUser.id,
      actionCode: "PERMISSION_UNASSIGN",
      entityName: "permission",
      entityId: parseResult.data.apiId,
      metadata: parseResult.data,
      createdAtUtc: nowUtc()
    });

    return reply.send({ ok: true });
  });
}
