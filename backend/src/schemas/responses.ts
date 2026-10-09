import { t, type TSchema } from "elysia";

/**
 * Shared TypeBox response schemas for OpenAPI + Elysia runtime validation.
 *
 * Design for safety: every object is `additionalProperties: true` and every
 * DB-derived numeric is a `number | string` union. mysql2 returns BIGINT
 * (e.g. sessions.id) and DECIMAL/SUM aggregates as strings, so a strict
 * `t.Number()` would make a perfectly valid response fail validation (→ 500).
 * These schemas document the shape without rejecting real payloads.
 */

const Num = t.Union([t.Number(), t.String()]); // DB numeric (may arrive as string)
const Flag = t.Union([t.Boolean(), t.Number(), t.String()]);
const NumNull = t.Union([t.Number(), t.String(), t.Null()]);
const Str = t.String();
const StrNull = t.Union([t.String(), t.Null()]);
const Utc = t.String({ description: "ISO-8601 UTC timestamp" });
const UtcNull = t.Union([t.String(), t.Null()]);

// Tolerant object: declares known fields but allows extras.
const obj = (props: Record<string, TSchema>) => t.Object(props, { additionalProperties: true });

// ── shared primitives ─────────────────────────────────────────────────────────
export const ErrorResponse = t.Object(
  {
    code: t.String(),
    message: t.String(),
    details: t.Optional(t.Record(t.String(), t.Unknown()))
  },
  { additionalProperties: true, description: "Standard error payload" }
);

export const OkResponse = obj({ ok: t.Boolean() });
export const IdResponse = obj({ id: Num });
export const StatusResponse = obj({ status: t.String() });
export const RootResponse = obj({
  status: t.String(),
  message: t.String(),
  auth: t.String(),
  docs: t.String()
});

// Spread into a route's response map to cover the global auth gate (401/403).
export const authErrors = { 401: ErrorResponse, 403: ErrorResponse };

// ── auth ──────────────────────────────────────────────────────────────────────
export const MeResponse = obj({
  user: obj({ id: Num, role: Str, organizationId: Num, username: t.Optional(Str) })
});

// ── orgs ──────────────────────────────────────────────────────────────────────
export const OrgItem = obj({
  id: Num,
  name: Str,
  status_id: Num,
  status_name: Str,
  created_at_utc: Utc,
  updated_at_utc: Utc
});
export const OrgList = obj({ items: t.Array(OrgItem) });

// ── users ─────────────────────────────────────────────────────────────────────
export const UserItem = obj({
  id: Num,
  username: Str,
  organization_id: Num,
  role_id: Num,
  role_name: Str,
  status_id: Num,
  status_name: Str,
  organization_name: t.Optional(Str),
  created_at_utc: Utc,
  updated_at_utc: Utc
});
export const UserList = obj({ items: t.Array(UserItem) });

// ── apis ──────────────────────────────────────────────────────────────────────
export const ApiItem = obj({
  id: Num,
  organization_id: Num,
  name: Str,
  base_path: Str,
  target_url: Str,
  is_public: Flag,
  is_enabled: Flag,
  always_on: Flag,
  created_at_utc: Utc,
  updated_at_utc: Utc,
  organization_name: t.Optional(Str)
});
export const ApiList = obj({ items: t.Array(ApiItem) });

// ── windows ───────────────────────────────────────────────────────────────────
export const WindowItem = obj({
  id: Num,
  subject_type: Str,
  subject_id: Num,
  day_of_week: Num,
  start_time: Str,
  end_time: Str,
  is_active: Flag,
  created_at_utc: Utc
});
export const WindowList = obj({ items: t.Array(WindowItem) });

// ── permissions ───────────────────────────────────────────────────────────────
export const PermissionList = obj({ items: t.Array(Num) });

// ── sessions ──────────────────────────────────────────────────────────────────
export const SessionItem = obj({
  id: Num, // BIGINT → string under mysql2
  user_id: Num,
  username: Str,
  organization_id: Num,
  organization_name: Str,
  role: Str,
  created_at_utc: Utc,
  last_activity_utc: Utc,
  expires_at_utc: Utc,
  revoked_at_utc: UtcNull,
  user_agent: StrNull,
  client_ip: StrNull
});
export const SessionList = obj({ items: t.Array(SessionItem) });

// ── lookups ───────────────────────────────────────────────────────────────────
export const LookupOption = obj({ id: Num, name: Str });
export const LookupsResponse = obj({
  roles: t.Array(LookupOption),
  userStatuses: t.Array(LookupOption),
  orgStatuses: t.Array(LookupOption)
});

// ── reports ───────────────────────────────────────────────────────────────────
const reportMetrics = {
  allowed_count: Num,
  denied_count: Num,
  total_count: Num,
  request_bytes_allowed: Num,
  response_bytes_allowed: Num,
  response_header_bytes_allowed: Num,
  request_bytes_denied: Num,
  response_bytes_denied: Num,
  response_header_bytes_denied: Num,
  request_bytes_total: Num,
  response_bytes_total: Num,
  response_header_bytes_total: Num,
  total_bytes_allowed: Num,
  total_bytes_denied: Num,
  total_bytes_total: Num
};

export const ReportRow = obj({
  // org-level rows carry org identifiers; user-level rows carry user identifiers,
  // and the other pair is null/absent — hence optional + nullable.
  organization_id: t.Optional(NumNull),
  organization_name: t.Optional(StrNull),
  user_id: t.Optional(NumNull),
  username: t.Optional(StrNull),
  ...reportMetrics
});

export const ReportResponse = obj({
  range: obj({ start: Utc, end: Utc }),
  items: t.Array(ReportRow),
  totals: obj(reportMetrics)
});
