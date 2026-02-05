import { FastifyInstance } from "fastify";
import { DateTime } from "luxon";
import { query } from "../db";
import { toUtcSql } from "../utils/datetime";

function getWeekRange(now: DateTime) {
  const start = now.startOf("week");
  const end = start.plus({ days: 6 }).endOf("day");
  return { start, end };
}

function getMonthRange(now: DateTime) {
  const start = now.startOf("month");
  const end = now.endOf("month");
  return { start, end };
}

function normalizeRow(row: any) {
  return {
    ...row,
    organization_id: row.organization_id ? Number(row.organization_id) : row.organization_id,
    user_id: row.user_id ? Number(row.user_id) : row.user_id,
    allowed_count: Number(row.allowed_count),
    denied_count: Number(row.denied_count),
    total_count: Number(row.total_count),
    request_bytes_allowed: Number(row.request_bytes_allowed),
    response_bytes_allowed: Number(row.response_bytes_allowed),
    request_bytes_denied: Number(row.request_bytes_denied),
    response_bytes_denied: Number(row.response_bytes_denied),
    request_bytes_total: Number(row.request_bytes_total),
    response_bytes_total: Number(row.response_bytes_total)
  };
}

function withTotals(rows: any[]) {
  const normalized = rows.map((row) => normalizeRow(row));
  const totals = normalized.reduce(
    (acc, row) => {
      acc.allowed_count += row.allowed_count;
      acc.denied_count += row.denied_count;
      acc.total_count += row.total_count;
      acc.request_bytes_allowed += row.request_bytes_allowed;
      acc.response_bytes_allowed += row.response_bytes_allowed;
      acc.request_bytes_denied += row.request_bytes_denied;
      acc.response_bytes_denied += row.response_bytes_denied;
      acc.request_bytes_total += row.request_bytes_total;
      acc.response_bytes_total += row.response_bytes_total;
      return acc;
    },
    {
      allowed_count: 0,
      denied_count: 0,
      total_count: 0,
      request_bytes_allowed: 0,
      response_bytes_allowed: 0,
      request_bytes_denied: 0,
      response_bytes_denied: 0,
      request_bytes_total: 0,
      response_bytes_total: 0
    }
  );

  return {
    items: normalized.map((row) => ({
      ...row,
      total_bytes_allowed: row.request_bytes_allowed + row.response_bytes_allowed,
      total_bytes_denied: row.request_bytes_denied + row.response_bytes_denied,
      total_bytes_total: row.request_bytes_total + row.response_bytes_total
    })),
    totals: {
      ...totals,
      total_bytes_allowed: totals.request_bytes_allowed + totals.response_bytes_allowed,
      total_bytes_denied: totals.request_bytes_denied + totals.response_bytes_denied,
      total_bytes_total: totals.request_bytes_total + totals.response_bytes_total
    }
  };
}

export async function registerReportRoutes(app: FastifyInstance) {
  app.get("/reports/orgs/weekly", async (request, reply) => {
    const now = DateTime.now().setZone("Africa/Johannesburg");
    const { start, end } = getWeekRange(now);
    const authUser = request.authUser!;

    const rows = await query(
      "SELECT o.id as organization_id, o.name as organization_name, " +
        "SUM(CASE WHEN l.deny_reason_id IS NULL THEN 1 ELSE 0 END) as allowed_count, " +
        "SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN 1 ELSE 0 END) as denied_count, " +
        "COUNT(*) as total_count, " +
        "SUM(CASE WHEN l.deny_reason_id IS NULL THEN l.request_bytes ELSE 0 END) as request_bytes_allowed, " +
        "SUM(CASE WHEN l.deny_reason_id IS NULL THEN l.response_bytes ELSE 0 END) as response_bytes_allowed, " +
        "SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN l.request_bytes ELSE 0 END) as request_bytes_denied, " +
        "SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN l.response_bytes ELSE 0 END) as response_bytes_denied, " +
        "SUM(l.request_bytes) as request_bytes_total, " +
        "SUM(l.response_bytes) as response_bytes_total " +
        "FROM access_logs l JOIN organizations o ON l.organization_id = o.id " +
        "WHERE l.created_at_utc BETWEEN ? AND ? " +
        "AND (? = 'global_admin' OR l.organization_id = ?) " +
        "GROUP BY o.id, o.name",
      [toUtcSql(start), toUtcSql(end), authUser.role, authUser.organizationId]
    );

    return reply.send(withTotals(rows));
  });

  app.get("/reports/orgs/monthly", async (request, reply) => {
    const now = DateTime.now().setZone("Africa/Johannesburg");
    const { start, end } = getMonthRange(now);
    const authUser = request.authUser!;

    const rows = await query(
      "SELECT o.id as organization_id, o.name as organization_name, " +
        "SUM(CASE WHEN l.deny_reason_id IS NULL THEN 1 ELSE 0 END) as allowed_count, " +
        "SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN 1 ELSE 0 END) as denied_count, " +
        "COUNT(*) as total_count, " +
        "SUM(CASE WHEN l.deny_reason_id IS NULL THEN l.request_bytes ELSE 0 END) as request_bytes_allowed, " +
        "SUM(CASE WHEN l.deny_reason_id IS NULL THEN l.response_bytes ELSE 0 END) as response_bytes_allowed, " +
        "SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN l.request_bytes ELSE 0 END) as request_bytes_denied, " +
        "SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN l.response_bytes ELSE 0 END) as response_bytes_denied, " +
        "SUM(l.request_bytes) as request_bytes_total, " +
        "SUM(l.response_bytes) as response_bytes_total " +
        "FROM access_logs l JOIN organizations o ON l.organization_id = o.id " +
        "WHERE l.created_at_utc BETWEEN ? AND ? " +
        "AND (? = 'global_admin' OR l.organization_id = ?) " +
        "GROUP BY o.id, o.name",
      [toUtcSql(start), toUtcSql(end), authUser.role, authUser.organizationId]
    );

    return reply.send(withTotals(rows));
  });

  app.get("/reports/users/weekly", async (request, reply) => {
    const now = DateTime.now().setZone("Africa/Johannesburg");
    const { start, end } = getWeekRange(now);
    const authUser = request.authUser!;

    const rows = await query(
      "SELECT u.id as user_id, u.username, " +
        "SUM(CASE WHEN l.deny_reason_id IS NULL THEN 1 ELSE 0 END) as allowed_count, " +
        "SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN 1 ELSE 0 END) as denied_count, " +
        "COUNT(*) as total_count, " +
        "SUM(CASE WHEN l.deny_reason_id IS NULL THEN l.request_bytes ELSE 0 END) as request_bytes_allowed, " +
        "SUM(CASE WHEN l.deny_reason_id IS NULL THEN l.response_bytes ELSE 0 END) as response_bytes_allowed, " +
        "SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN l.request_bytes ELSE 0 END) as request_bytes_denied, " +
        "SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN l.response_bytes ELSE 0 END) as response_bytes_denied, " +
        "SUM(l.request_bytes) as request_bytes_total, " +
        "SUM(l.response_bytes) as response_bytes_total " +
        "FROM access_logs l JOIN users u ON l.user_id = u.id " +
        "WHERE l.created_at_utc BETWEEN ? AND ? " +
        "AND (? = 'global_admin' OR u.organization_id = ?) " +
        "GROUP BY u.id, u.username",
      [toUtcSql(start), toUtcSql(end), authUser.role, authUser.organizationId]
    );

    return reply.send(withTotals(rows));
  });

  app.get("/reports/users/monthly", async (request, reply) => {
    const now = DateTime.now().setZone("Africa/Johannesburg");
    const { start, end } = getMonthRange(now);
    const authUser = request.authUser!;

    const rows = await query(
      "SELECT u.id as user_id, u.username, " +
        "SUM(CASE WHEN l.deny_reason_id IS NULL THEN 1 ELSE 0 END) as allowed_count, " +
        "SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN 1 ELSE 0 END) as denied_count, " +
        "COUNT(*) as total_count, " +
        "SUM(CASE WHEN l.deny_reason_id IS NULL THEN l.request_bytes ELSE 0 END) as request_bytes_allowed, " +
        "SUM(CASE WHEN l.deny_reason_id IS NULL THEN l.response_bytes ELSE 0 END) as response_bytes_allowed, " +
        "SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN l.request_bytes ELSE 0 END) as request_bytes_denied, " +
        "SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN l.response_bytes ELSE 0 END) as response_bytes_denied, " +
        "SUM(l.request_bytes) as request_bytes_total, " +
        "SUM(l.response_bytes) as response_bytes_total " +
        "FROM access_logs l JOIN users u ON l.user_id = u.id " +
        "WHERE l.created_at_utc BETWEEN ? AND ? " +
        "AND (? = 'global_admin' OR u.organization_id = ?) " +
        "GROUP BY u.id, u.username",
      [toUtcSql(start), toUtcSql(end), authUser.role, authUser.organizationId]
    );

    return reply.send(withTotals(rows));
  });
}
