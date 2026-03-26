import { Elysia } from "elysia";
import { DateTime } from "luxon";
import { toUtcSql } from "../utils/datetime";
import { buildError } from "../utils/errors";
import { query as dbQuery, type QueryValue } from "../db/index";
import type { ProtectedContext } from "../types/http";

const REPORT_TZ = "Africa/Johannesburg";

type ReportsQuery = {
  from?: string;
  to?: string;
};

type AggregateRow = {
  organization_id?: number | string | null;
  organization_name?: string | null;
  user_id?: number | string | null;
  username?: string | null;
  allowed_count: number | string;
  denied_count: number | string;
  total_count: number | string;
  request_bytes_allowed: number | string;
  response_bytes_allowed: number | string;
  response_header_bytes_allowed: number | string;
  request_bytes_denied: number | string;
  response_bytes_denied: number | string;
  response_header_bytes_denied: number | string;
  request_bytes_total: number | string;
  response_bytes_total: number | string;
  response_header_bytes_total: number | string;
};

type NormalizedAggregateRow = {
  organization_id?: number | string | null;
  organization_name?: string | null;
  user_id?: number | string | null;
  username?: string | null;
  allowed_count: number;
  denied_count: number;
  total_count: number;
  request_bytes_allowed: number;
  response_bytes_allowed: number;
  response_header_bytes_allowed: number;
  request_bytes_denied: number;
  response_bytes_denied: number;
  response_header_bytes_denied: number;
  request_bytes_total: number;
  response_bytes_total: number;
  response_header_bytes_total: number;
};

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

function parseDate(value: string, boundary: "start" | "end"): DateTime | null {
  const parsed = DateTime.fromISO(value, { zone: REPORT_TZ });
  if (!parsed.isValid) {
    return null;
  }
  if (!value.includes("T")) {
    return boundary === "start" ? parsed.startOf("day") : parsed.endOf("day");
  }
  return parsed;
}

function resolveRange(queryParams: ReportsQuery, fallback: { start: DateTime; end: DateTime }) {
  const fromRaw = typeof queryParams?.from === "string" ? queryParams.from : undefined;
  const toRaw = typeof queryParams?.to === "string" ? queryParams.to : undefined;

  let start = fallback.start;
  let end = fallback.end;

  if (fromRaw) {
    const parsed = parseDate(fromRaw, "start");
    if (!parsed) {
      return { error: buildError("INVALID_REQUEST", "Invalid from date") };
    }
    start = parsed;
  }

  if (toRaw) {
    const parsed = parseDate(toRaw, "end");
    if (!parsed) {
      return { error: buildError("INVALID_REQUEST", "Invalid to date") };
    }
    end = parsed;
  }

  if (fromRaw && !toRaw) {
    end = DateTime.now().setZone(REPORT_TZ);
  }

  if (toRaw && !fromRaw) {
    start = end.startOf("day");
  }

  if (start > end) {
    return { error: buildError("INVALID_REQUEST", "from must be before to") };
  }

  return { start, end };
}

function normalizeRow(row: AggregateRow): NormalizedAggregateRow {
  return {
    ...row,
    organization_id: row.organization_id == null ? null : Number(row.organization_id),
    user_id: row.user_id == null ? null : Number(row.user_id),
    allowed_count: Number(row.allowed_count),
    denied_count: Number(row.denied_count),
    total_count: Number(row.total_count),
    request_bytes_allowed: Number(row.request_bytes_allowed),
    response_bytes_allowed: Number(row.response_bytes_allowed),
    response_header_bytes_allowed: Number(row.response_header_bytes_allowed),
    request_bytes_denied: Number(row.request_bytes_denied),
    response_bytes_denied: Number(row.response_bytes_denied),
    response_header_bytes_denied: Number(row.response_header_bytes_denied),
    request_bytes_total: Number(row.request_bytes_total),
    response_bytes_total: Number(row.response_bytes_total),
    response_header_bytes_total: Number(row.response_header_bytes_total)
  };
}

function withTotals(rows: AggregateRow[]) {
  const normalized = rows.map((row) => normalizeRow(row));
  const totals = normalized.reduce(
    (acc, row) => {
      acc.allowed_count += row.allowed_count;
      acc.denied_count += row.denied_count;
      acc.total_count += row.total_count;
      acc.request_bytes_allowed += row.request_bytes_allowed;
      acc.response_bytes_allowed += row.response_bytes_allowed;
      acc.response_header_bytes_allowed += row.response_header_bytes_allowed;
      acc.request_bytes_denied += row.request_bytes_denied;
      acc.response_bytes_denied += row.response_bytes_denied;
      acc.response_header_bytes_denied += row.response_header_bytes_denied;
      acc.request_bytes_total += row.request_bytes_total;
      acc.response_bytes_total += row.response_bytes_total;
      acc.response_header_bytes_total += row.response_header_bytes_total;
      return acc;
    },
    {
      allowed_count: 0, denied_count: 0, total_count: 0,
      request_bytes_allowed: 0, response_bytes_allowed: 0, response_header_bytes_allowed: 0,
      request_bytes_denied: 0, response_bytes_denied: 0, response_header_bytes_denied: 0,
      request_bytes_total: 0, response_bytes_total: 0, response_header_bytes_total: 0
    }
  );

  return {
    items: normalized.map((row) => ({
      ...row,
      total_bytes_allowed: row.request_bytes_allowed + row.response_bytes_allowed + row.response_header_bytes_allowed,
      total_bytes_denied: row.request_bytes_denied + row.response_bytes_denied + row.response_header_bytes_denied,
      total_bytes_total: row.request_bytes_total + row.response_bytes_total + row.response_header_bytes_total
    })),
    totals: {
      ...totals,
      total_bytes_allowed: totals.request_bytes_allowed + totals.response_bytes_allowed + totals.response_header_bytes_allowed,
      total_bytes_denied: totals.request_bytes_denied + totals.response_bytes_denied + totals.response_header_bytes_denied,
      total_bytes_total: totals.request_bytes_total + totals.response_bytes_total + totals.response_header_bytes_total
    }
  };
}

const ORG_QUERY =
  `SELECT o.id as organization_id, o.name as organization_name, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NULL THEN 1 ELSE 0 END) as allowed_count, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN 1 ELSE 0 END) as denied_count, ` +
  `COUNT(*) as total_count, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NULL THEN l.request_bytes ELSE 0 END) as request_bytes_allowed, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NULL THEN l.response_bytes ELSE 0 END) as response_bytes_allowed, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NULL THEN l.response_header_bytes ELSE 0 END) as response_header_bytes_allowed, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN l.request_bytes ELSE 0 END) as request_bytes_denied, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN l.response_bytes ELSE 0 END) as response_bytes_denied, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN l.response_header_bytes ELSE 0 END) as response_header_bytes_denied, ` +
  `SUM(l.request_bytes) as request_bytes_total, SUM(l.response_bytes) as response_bytes_total, SUM(l.response_header_bytes) as response_header_bytes_total ` +
  `FROM access_logs l JOIN organizations o ON l.organization_id = o.id ` +
  `WHERE l.created_at_utc BETWEEN ? AND ? AND (? = 'global_admin' OR l.organization_id = ?) GROUP BY o.id, o.name`;

const USER_QUERY =
  `SELECT u.id as user_id, u.username, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NULL THEN 1 ELSE 0 END) as allowed_count, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN 1 ELSE 0 END) as denied_count, ` +
  `COUNT(*) as total_count, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NULL THEN l.request_bytes ELSE 0 END) as request_bytes_allowed, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NULL THEN l.response_bytes ELSE 0 END) as response_bytes_allowed, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NULL THEN l.response_header_bytes ELSE 0 END) as response_header_bytes_allowed, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN l.request_bytes ELSE 0 END) as request_bytes_denied, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN l.response_bytes ELSE 0 END) as response_bytes_denied, ` +
  `SUM(CASE WHEN l.deny_reason_id IS NOT NULL THEN l.response_header_bytes ELSE 0 END) as response_header_bytes_denied, ` +
  `SUM(l.request_bytes) as request_bytes_total, SUM(l.response_bytes) as response_bytes_total, SUM(l.response_header_bytes) as response_header_bytes_total ` +
  `FROM access_logs l JOIN users u ON l.user_id = u.id ` +
  `WHERE l.created_at_utc BETWEEN ? AND ? AND (? = 'global_admin' OR u.organization_id = ?) GROUP BY u.id, u.username`;

export const reportsPlugin = new Elysia({ prefix: "/reports" })
  .get("/orgs/weekly", async (context) => {
    const { query: queryParams, authUser, _authError, set } = context as unknown as ProtectedContext<ReportsQuery>;
    if (!authUser) { set.status = 401; return _authError; }
    const now = DateTime.now().setZone(REPORT_TZ);
    const range = resolveRange(queryParams, getWeekRange(now));
    if (range.error) { set.status = 400; return range.error; }
    const { start, end } = range;
    const rows = await dbQuery<AggregateRow[]>(ORG_QUERY, [toUtcSql(start), toUtcSql(end), authUser.role, authUser.organizationId] as QueryValue[]);
    return { range: { start: toUtcSql(start), end: toUtcSql(end) }, ...withTotals(rows) };
  })
  .get("/orgs/monthly", async (context) => {
    const { query: queryParams, authUser, _authError, set } = context as unknown as ProtectedContext<ReportsQuery>;
    if (!authUser) { set.status = 401; return _authError; }
    const now = DateTime.now().setZone(REPORT_TZ);
    const range = resolveRange(queryParams, getMonthRange(now));
    if (range.error) { set.status = 400; return range.error; }
    const { start, end } = range;
    const rows = await dbQuery<AggregateRow[]>(ORG_QUERY, [toUtcSql(start), toUtcSql(end), authUser.role, authUser.organizationId] as QueryValue[]);
    return { range: { start: toUtcSql(start), end: toUtcSql(end) }, ...withTotals(rows) };
  })
  .get("/users/weekly", async (context) => {
    const { query: queryParams, authUser, _authError, set } = context as unknown as ProtectedContext<ReportsQuery>;
    if (!authUser) { set.status = 401; return _authError; }
    const now = DateTime.now().setZone(REPORT_TZ);
    const range = resolveRange(queryParams, getWeekRange(now));
    if (range.error) { set.status = 400; return range.error; }
    const { start, end } = range;
    const rows = await dbQuery<AggregateRow[]>(USER_QUERY, [toUtcSql(start), toUtcSql(end), authUser.role, authUser.organizationId] as QueryValue[]);
    return { range: { start: toUtcSql(start), end: toUtcSql(end) }, ...withTotals(rows) };
  })
  .get("/users/monthly", async (context) => {
    const { query: queryParams, authUser, _authError, set } = context as unknown as ProtectedContext<ReportsQuery>;
    if (!authUser) { set.status = 401; return _authError; }
    const now = DateTime.now().setZone(REPORT_TZ);
    const range = resolveRange(queryParams, getMonthRange(now));
    if (range.error) { set.status = 400; return range.error; }
    const { start, end } = range;
    const rows = await dbQuery<AggregateRow[]>(USER_QUERY, [toUtcSql(start), toUtcSql(end), authUser.role, authUser.organizationId] as QueryValue[]);
    return { range: { start: toUtcSql(start), end: toUtcSql(end) }, ...withTotals(rows) };
  });
