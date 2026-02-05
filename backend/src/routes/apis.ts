import { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../db";
import { buildError } from "../utils/errors";
import { logAudit } from "../logging";
import { nowUtc } from "../utils/datetime";

const apiCreateSchema = z.object({
  organizationId: z.number().int(),
  name: z.string().min(2),
  basePath: z.string().min(2),
  targetUrl: z.string().url(),
  isPublic: z.boolean(),
  isEnabled: z.boolean().optional(),
  alwaysOn: z.boolean().optional()
});

const apiUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  basePath: z.string().min(2).optional(),
  targetUrl: z.string().url().optional(),
  isPublic: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  alwaysOn: z.boolean().optional(),
  organizationId: z.number().int().optional()
});

export async function registerApiRoutes(app: FastifyInstance) {
  app.get("/apis", async (request, reply) => {
    const authUser = request.authUser!;
    if (authUser.role === "global_admin") {
      const rows = await query(
        "SELECT a.*, o.name as organization_name FROM api_definitions a JOIN organizations o ON a.organization_id = o.id"
      );
      return reply.send({ items: rows });
    }

    if (authUser.role === "org_admin") {
      const rows = await query(
        "SELECT a.*, o.name as organization_name FROM api_definitions a JOIN organizations o ON a.organization_id = o.id WHERE a.organization_id = ?",
        [authUser.organizationId]
      );
      return reply.send({ items: rows });
    }

    const rows = await query(
      "SELECT DISTINCT a.*, o.name as organization_name FROM api_definitions a JOIN organizations o ON a.organization_id = o.id LEFT JOIN user_api_permissions p ON a.id = p.api_id WHERE a.organization_id = ? AND (a.is_public = 1 OR p.user_id = ?)",
      [authUser.organizationId, authUser.id]
    );
    return reply.send({ items: rows });
  });

  app.post("/apis", async (request, reply) => {
    const authUser = request.authUser!;
    const parseResult = apiCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid API payload"));
    }

    if (authUser.role === "org_admin" && parseResult.data.organizationId !== authUser.organizationId) {
      return reply.status(403).send(buildError("FORBIDDEN", "Cannot create APIs outside your organization"));
    }

    const now = nowUtc();
    await query(
      "INSERT INTO api_definitions (organization_id, name, base_path, target_url, is_public, is_enabled, always_on, created_at_utc, updated_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        parseResult.data.organizationId,
        parseResult.data.name,
        parseResult.data.basePath,
        parseResult.data.targetUrl,
        parseResult.data.isPublic ? 1 : 0,
        parseResult.data.isEnabled === false ? 0 : 1,
        parseResult.data.alwaysOn ? 1 : 0,
        now,
        now
      ]
    );

    const created = await query<{ id: number }[]>(
      "SELECT id FROM api_definitions WHERE organization_id = ? AND base_path = ?",
      [parseResult.data.organizationId, parseResult.data.basePath]
    );
    const createdId = created[0].id;

    await logAudit({
      organizationId: parseResult.data.organizationId,
      userId: authUser.id,
      actionCode: "API_CREATE",
      entityName: "api",
      entityId: createdId,
      metadata: { name: parseResult.data.name },
      createdAtUtc: now
    });

    return reply.status(201).send({ id: createdId });
  });

  app.put("/apis/:id", async (request, reply) => {
    const authUser = request.authUser!;
    const parseResult = apiUpdateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid API payload"));
    }

    const apiId = Number.parseInt((request.params as any).id, 10);
    if (Number.isNaN(apiId)) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid API id"));
    }

    if (authUser.role === "org_admin" && parseResult.data.organizationId && parseResult.data.organizationId !== authUser.organizationId) {
      return reply.status(403).send(buildError("FORBIDDEN", "Cannot move APIs outside your organization"));
    }

    const updates: string[] = [];
    const values: any[] = [];
    if (parseResult.data.name) {
      updates.push("name = ?");
      values.push(parseResult.data.name);
    }
    if (parseResult.data.basePath) {
      updates.push("base_path = ?");
      values.push(parseResult.data.basePath);
    }
    if (parseResult.data.targetUrl) {
      updates.push("target_url = ?");
      values.push(parseResult.data.targetUrl);
    }
    if (parseResult.data.isPublic !== undefined) {
      updates.push("is_public = ?");
      values.push(parseResult.data.isPublic ? 1 : 0);
    }
    if (parseResult.data.isEnabled !== undefined) {
      updates.push("is_enabled = ?");
      values.push(parseResult.data.isEnabled ? 1 : 0);
    }
    if (parseResult.data.alwaysOn !== undefined) {
      updates.push("always_on = ?");
      values.push(parseResult.data.alwaysOn ? 1 : 0);
    }
    if (parseResult.data.organizationId !== undefined) {
      updates.push("organization_id = ?");
      values.push(parseResult.data.organizationId);
    }

    updates.push("updated_at_utc = ?");
    values.push(nowUtc());
    values.push(apiId);

    await query(`UPDATE api_definitions SET ${updates.join(", ")} WHERE id = ?`, values);

    await logAudit({
      organizationId: authUser.organizationId,
      userId: authUser.id,
      actionCode: "API_UPDATE",
      entityName: "api",
      entityId: apiId,
      metadata: parseResult.data,
      createdAtUtc: nowUtc()
    });

    return reply.send({ ok: true });
  });

  app.post("/apis/:id/archive", async (request, reply) => {
    const apiId = Number.parseInt((request.params as any).id, 10);
    if (Number.isNaN(apiId)) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid API id"));
    }
    const now = nowUtc();
    await query("UPDATE api_definitions SET is_enabled = 0, updated_at_utc = ? WHERE id = ?", [now, apiId]);

    await logAudit({
      organizationId: request.authUser!.organizationId,
      userId: request.authUser!.id,
      actionCode: "API_ARCHIVE",
      entityName: "api",
      entityId: apiId,
      metadata: {},
      createdAtUtc: now
    });

    return reply.send({ ok: true });
  });
}
