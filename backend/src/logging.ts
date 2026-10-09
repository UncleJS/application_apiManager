import { db } from "./db/client";
import { sql } from "drizzle-orm";
import { sanitizeAuditMetadata } from "./utils/audit";

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
  const reasonId = params.denyReasonCode ? await getDenyReasonId(params.denyReasonCode) : null;

  await db.execute(
    sql`INSERT INTO access_logs (organization_id, user_id, api_id, method, path, status, request_bytes, response_bytes, response_header_bytes, duration_ms, client_ip, deny_reason_id, created_at_utc) VALUES (${params.organizationId}, ${params.userId}, ${params.apiId}, ${params.method}, ${params.path}, ${params.status}, ${params.requestBytes}, ${params.responseBytes}, ${params.responseHeaderBytes}, ${params.durationMs}, ${params.clientIp}, ${reasonId}, ${params.createdAtUtc})`
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

  await db.execute(
    sql`INSERT INTO audit_logs (organization_id, user_id, action_id, entity_id, metadata_json, created_at_utc) VALUES (${params.organizationId}, ${params.userId}, ${actionId}, ${entityId}, ${JSON.stringify(sanitizeAuditMetadata(params.metadata))}, ${params.createdAtUtc})`
  );
}

async function getDenyReasonId(code: string): Promise<number | null> {
  const rows = await db.execute(sql`SELECT id FROM deny_reasons WHERE code = ${code}`);
  const data = rows[0] as unknown as { id: number }[];
  if (!data || data.length === 0) {
    return null;
  }
  return data[0].id;
}

async function getAuditActionId(code: string): Promise<number> {
  const rows = await db.execute(sql`SELECT id FROM audit_actions WHERE code = ${code}`);
  const data = rows[0] as unknown as { id: number }[];
  if (data && data.length > 0) {
    return data[0].id;
  }
  await db.execute(sql`INSERT IGNORE INTO audit_actions (code) VALUES (${code})`);
  const created = await db.execute(sql`SELECT id FROM audit_actions WHERE code = ${code}`);
  const createdRows = created[0] as unknown as { id: number }[];
  if (!createdRows || createdRows.length === 0) {
    throw new Error(`Unknown audit action: ${code}`);
  }
  return createdRows[0].id;
}

async function getAuditEntityId(name: string): Promise<number> {
  const rows = await db.execute(sql`SELECT id FROM audit_entities WHERE name = ${name}`);
  const data = rows[0] as unknown as { id: number }[];
  if (!data || data.length === 0) {
    throw new Error(`Unknown audit entity: ${name}`);
  }
  return data[0].id;
}
