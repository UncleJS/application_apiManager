import { query } from "./db";

export async function logAccess(params: {
  organizationId: number;
  userId: number | null;
  apiId: number;
  method: string;
  path: string;
  status: number;
  requestBytes: number;
  responseBytes: number;
  responseHeaderBytes: number;
  durationMs: number;
  clientIp: string;
  denyReasonCode?: string | null;
  createdAtUtc: string;
}): Promise<void> {
  const reasonId = params.denyReasonCode
    ? await getDenyReasonId(params.denyReasonCode)
    : null;

  await query(
    "INSERT INTO access_logs (organization_id, user_id, api_id, method, path, status, request_bytes, response_bytes, response_header_bytes, duration_ms, client_ip, deny_reason_id, created_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      params.organizationId,
      params.userId,
      params.apiId,
      params.method,
      params.path,
      params.status,
      params.requestBytes,
      params.responseBytes,
      params.responseHeaderBytes,
      params.durationMs,
      params.clientIp,
      reasonId,
      params.createdAtUtc
    ]
  );
}

export async function logAudit(params: {
  organizationId: number;
  userId: number;
  actionCode: string;
  entityName: string;
  entityId: number;
  metadata?: Record<string, unknown>;
  createdAtUtc: string;
}): Promise<void> {
  const actionId = await getAuditActionId(params.actionCode);
  const entityId = await getAuditEntityId(params.entityName);

  await query(
    "INSERT INTO audit_logs (organization_id, user_id, action_id, entity_id, metadata_json, created_at_utc) VALUES (?, ?, ?, ?, ?, ?)",
    [
      params.organizationId,
      params.userId,
      actionId,
      entityId,
      JSON.stringify(params.metadata ?? {}),
      params.createdAtUtc
    ]
  );
}

async function getDenyReasonId(code: string): Promise<number> {
  const rows = await query<{ id: number }[]>("SELECT id FROM deny_reasons WHERE code = ?", [code]);
  if (!rows || rows.length === 0) {
    throw new Error(`Unknown deny reason: ${code}`);
  }
  return rows[0].id;
}

async function getAuditActionId(code: string): Promise<number> {
  const rows = await query<{ id: number }[]>("SELECT id FROM audit_actions WHERE code = ?", [code]);
  if (!rows || rows.length === 0) {
    throw new Error(`Unknown audit action: ${code}`);
  }
  return rows[0].id;
}

async function getAuditEntityId(name: string): Promise<number> {
  const rows = await query<{ id: number }[]>("SELECT id FROM audit_entities WHERE name = ?", [name]);
  if (!rows || rows.length === 0) {
    throw new Error(`Unknown audit entity: ${name}`);
  }
  return rows[0].id;
}
