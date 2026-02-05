import { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../db";
import { buildError } from "../utils/errors";
import { isFiveMinuteIncrement, isValidTime } from "../utils/time";
import { logAudit } from "../logging";
import { nowUtc } from "../utils/datetime";

const windowCreateSchema = z.object({
  subjectType: z.enum(["user", "api"]),
  subjectId: z.number().int(),
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: z.string(),
  endTime: z.string()
});

const windowUpdateSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  isActive: z.boolean().optional()
});

function validateTimes(startTime?: string, endTime?: string): string | null {
  if (startTime && (!isValidTime(startTime) || !isFiveMinuteIncrement(startTime))) {
    return "Invalid start time";
  }
  if (endTime && (!isValidTime(endTime) || !isFiveMinuteIncrement(endTime))) {
    return "Invalid end time";
  }
  return null;
}

export async function registerWindowRoutes(app: FastifyInstance) {
  app.get("/windows", async (request, reply) => {
    const subjectType = (request.query as any).subjectType as string | undefined;
    const subjectId = Number.parseInt((request.query as any).subjectId, 10);
    if (!subjectType || Number.isNaN(subjectId)) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "subjectType and subjectId required"));
    }

    const rows = await query(
      "SELECT id, subject_type, subject_id, day_of_week, start_time, end_time, is_active, created_at_utc FROM access_windows WHERE subject_type = ? AND subject_id = ?",
      [subjectType, subjectId]
    );
    return reply.send({ items: rows });
  });

  app.post("/windows", async (request, reply) => {
    const parseResult = windowCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid window payload"));
    }

    const timeError = validateTimes(parseResult.data.startTime, parseResult.data.endTime);
    if (timeError) {
      return reply.status(400).send(buildError("INVALID_TIME", timeError));
    }

    const now = nowUtc();
    await query(
      "INSERT INTO access_windows (subject_type, subject_id, day_of_week, start_time, end_time, is_active, created_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        parseResult.data.subjectType,
        parseResult.data.subjectId,
        parseResult.data.dayOfWeek,
        parseResult.data.startTime,
        parseResult.data.endTime,
        1,
        now
      ]
    );

    const created = await query<{ id: number }[]>(
      "SELECT id FROM access_windows WHERE subject_type = ? AND subject_id = ? ORDER BY id DESC LIMIT 1",
      [parseResult.data.subjectType, parseResult.data.subjectId]
    );
    const createdId = created[0].id;

    await logAudit({
      organizationId: request.authUser!.organizationId,
      userId: request.authUser!.id,
      actionCode: "WINDOW_CREATE",
      entityName: "window",
      entityId: createdId,
      metadata: parseResult.data,
      createdAtUtc: now
    });

    return reply.status(201).send({ id: createdId });
  });

  app.put("/windows/:id", async (request, reply) => {
    const windowId = Number.parseInt((request.params as any).id, 10);
    if (Number.isNaN(windowId)) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid window id"));
    }

    const parseResult = windowUpdateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid window payload"));
    }

    const timeError = validateTimes(parseResult.data.startTime, parseResult.data.endTime);
    if (timeError) {
      return reply.status(400).send(buildError("INVALID_TIME", timeError));
    }

    const updates: string[] = [];
    const values: any[] = [];
    if (parseResult.data.dayOfWeek !== undefined) {
      updates.push("day_of_week = ?");
      values.push(parseResult.data.dayOfWeek);
    }
    if (parseResult.data.startTime !== undefined) {
      updates.push("start_time = ?");
      values.push(parseResult.data.startTime);
    }
    if (parseResult.data.endTime !== undefined) {
      updates.push("end_time = ?");
      values.push(parseResult.data.endTime);
    }
    if (parseResult.data.isActive !== undefined) {
      updates.push("is_active = ?");
      values.push(parseResult.data.isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "No updates provided"));
    }

    values.push(windowId);
    await query(`UPDATE access_windows SET ${updates.join(", ")} WHERE id = ?`, values);

    await logAudit({
      organizationId: request.authUser!.organizationId,
      userId: request.authUser!.id,
      actionCode: "WINDOW_UPDATE",
      entityName: "window",
      entityId: windowId,
      metadata: parseResult.data,
      createdAtUtc: nowUtc()
    });

    return reply.send({ ok: true });
  });

  app.post("/windows/:id/archive", async (request, reply) => {
    const windowId = Number.parseInt((request.params as any).id, 10);
    if (Number.isNaN(windowId)) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid window id"));
    }
    await query("UPDATE access_windows SET is_active = 0 WHERE id = ?", [windowId]);

    await logAudit({
      organizationId: request.authUser!.organizationId,
      userId: request.authUser!.id,
      actionCode: "WINDOW_ARCHIVE",
      entityName: "window",
      entityId: windowId,
      metadata: {},
      createdAtUtc: nowUtc()
    });

    return reply.send({ ok: true });
  });
}
