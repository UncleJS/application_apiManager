import { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../db";
import { buildError } from "../utils/errors";
import { logAudit } from "../logging";
import { nowUtc } from "../utils/datetime";

const orgCreateSchema = z.object({
  name: z.string().min(2)
});

const orgUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  statusId: z.number().int().optional()
});

async function getStatusId(name: string): Promise<number> {
  const rows = await query<{ id: number }[]>("SELECT id FROM organization_statuses WHERE name = ?", [name]);
  if (!rows || rows.length === 0) {
    throw new Error(`Missing organization status ${name}`);
  }
  return rows[0].id;
}

export async function registerOrgRoutes(app: FastifyInstance) {
  app.get("/orgs", async (_request, reply) => {
    const rows = await query(
      "SELECT o.id, o.name, o.status_id, s.name as status_name, o.created_at_utc, o.updated_at_utc FROM organizations o JOIN organization_statuses s ON o.status_id = s.id"
    );
    return reply.send({ items: rows });
  });

  app.post("/orgs", async (request, reply) => {
    const parseResult = orgCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid organization payload"));
    }

    const statusId = await getStatusId("active");
    const now = nowUtc();
    await query(
      "INSERT INTO organizations (name, status_id, created_at_utc, updated_at_utc) VALUES (?, ?, ?, ?)",
      [parseResult.data.name, statusId, now, now]
    );

    const org = await query<{ id: number }[]>("SELECT id FROM organizations WHERE name = ?", [parseResult.data.name]);
    const createdId = org[0].id;

    await logAudit({
      organizationId: createdId,
      userId: request.authUser!.id,
      actionCode: "ORG_CREATE",
      entityName: "org",
      entityId: createdId,
      metadata: { name: parseResult.data.name },
      createdAtUtc: now
    });

    return reply.status(201).send({ id: createdId });
  });

  app.put("/orgs/:id", async (request, reply) => {
    const parseResult = orgUpdateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid organization payload"));
    }

    const orgId = Number.parseInt((request.params as any).id, 10);
    if (Number.isNaN(orgId)) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid organization id"));
    }

    const updates: string[] = [];
    const values: any[] = [];
    if (parseResult.data.name) {
      updates.push("name = ?");
      values.push(parseResult.data.name);
    }
    if (parseResult.data.statusId) {
      updates.push("status_id = ?");
      values.push(parseResult.data.statusId);
    }

    updates.push("updated_at_utc = ?");
    values.push(nowUtc());

    if (updates.length === 0) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "No updates provided"));
    }

    values.push(orgId);
    await query(`UPDATE organizations SET ${updates.join(", ")} WHERE id = ?`, values);

    await logAudit({
      organizationId: orgId,
      userId: request.authUser!.id,
      actionCode: "ORG_UPDATE",
      entityName: "org",
      entityId: orgId,
      metadata: parseResult.data,
      createdAtUtc: nowUtc()
    });

    return reply.send({ ok: true });
  });

  app.post("/orgs/:id/archive", async (request, reply) => {
    const orgId = Number.parseInt((request.params as any).id, 10);
    if (Number.isNaN(orgId)) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid organization id"));
    }
    const statusId = await getStatusId("archived");
    const now = nowUtc();
    await query("UPDATE organizations SET status_id = ?, updated_at_utc = ? WHERE id = ?", [statusId, now, orgId]);

    await logAudit({
      organizationId: orgId,
      userId: request.authUser!.id,
      actionCode: "ORG_ARCHIVE",
      entityName: "org",
      entityId: orgId,
      metadata: {},
      createdAtUtc: now
    });

    return reply.send({ ok: true });
  });
}
