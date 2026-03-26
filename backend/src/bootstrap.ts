import { config } from "./config";
import { hashPassword } from "./auth";
import { db } from "./db/client";
import { sql } from "drizzle-orm";
import { seedDevData, seedAccessLogs } from "./scripts/seed";
import { SAST_TZ } from "./access";
import { nowUtc } from "./utils/datetime";

const GLOBAL_ORG_NAME = "Global";

const LOOKUP_TABLES = {
  organization_statuses: "organization_statuses",
  roles: "roles",
  user_statuses: "user_statuses"
} as const;

async function getIdByName(table: keyof typeof LOOKUP_TABLES, name: string): Promise<number> {
  let rows;

  switch (table) {
    case "organization_statuses":
      rows = await db.execute(sql`SELECT id FROM organization_statuses WHERE name = ${name}`);
      break;
    case "roles":
      rows = await db.execute(sql`SELECT id FROM roles WHERE name = ${name}`);
      break;
    case "user_statuses":
      rows = await db.execute(sql`SELECT id FROM user_statuses WHERE name = ${name}`);
      break;
  }

  const data = rows[0] as unknown as { id: number }[];
  if (!data || data.length === 0) {
    throw new Error(`Missing ${table} row for ${name}`);
  }
  return data[0].id;
}

export async function ensureGlobalOrg(): Promise<number> {
  const statusId = await getIdByName("organization_statuses", "active");
  const existing = await db.execute(sql`SELECT id FROM organizations WHERE name = ${GLOBAL_ORG_NAME}`);
  const existingData = existing[0] as unknown as { id: number }[];
  if (existingData && existingData.length > 0) {
    return existingData[0].id;
  }
  const now = nowUtc();
  await db.execute(
    sql`INSERT INTO organizations (name, status_id, created_at_utc, updated_at_utc) VALUES (${GLOBAL_ORG_NAME}, ${statusId}, ${now}, ${now})`
  );
  const rows = await db.execute(sql`SELECT id FROM organizations WHERE name = ${GLOBAL_ORG_NAME}`);
  return (rows[0] as unknown as { id: number }[])[0].id;
}

async function waitForDb(): Promise<void> {
  const retries = Number.parseInt(process.env.DB_WAIT_RETRIES ?? "60", 10);
  const delayMs = Number.parseInt(process.env.DB_WAIT_DELAY_MS ?? "2000", 10);
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await db.execute(sql`SELECT 1`);
      return;
    } catch (error) {
      if (attempt === retries) {
        throw new Error("Database not ready after retries");
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function ensureBootstrapAdmin(globalOrgId: number): Promise<void> {
  if (!config.bootstrapAdmin) {
    return;
  }

  const roleId = await getIdByName("roles", "global_admin");
  const statusId = await getIdByName("user_statuses", "active");

  const existing = await db.execute(
    sql`SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'global_admin' LIMIT 1`
  );
  const existingRows = existing[0] as unknown as { id: number }[];
  if (existingRows.length > 0) {
    return;
  }

  const existingByUsername = await db.execute(
    sql`SELECT id, role_id, status_id, organization_id FROM users WHERE username = 'global-admin'`
  );
  const existingData = existingByUsername[0] as unknown as {
    id: number;
    role_id: number;
    status_id: number;
    organization_id: number;
  }[];

  if (existingData && existingData.length > 0) {
    const user = existingData[0];
    const updates: string[] = [];
    const params: Array<number | string> = [];

    if (user.role_id !== roleId) { updates.push("role_id = ?"); params.push(roleId); }
    if (user.status_id !== statusId) { updates.push("status_id = ?"); params.push(statusId); }
    if (user.organization_id !== globalOrgId) { updates.push("organization_id = ?"); params.push(globalOrgId); }

    if (updates.length > 0) {
      updates.push("updated_at_utc = ?");
      params.push(nowUtc());
      params.push(user.id);
      await db.execute(sql.raw(`UPDATE users SET ${updates.join(", ")} WHERE id = ${user.id}`));
    }
    return;
  }

  const passwordHash = await hashPassword(config.bootstrapPassword);
  const now = nowUtc();
  await db.execute(
    sql`INSERT INTO users (username, password_hash, organization_id, role_id, status_id, created_at_utc, updated_at_utc) VALUES ('global-admin', ${passwordHash}, ${globalOrgId}, ${roleId}, ${statusId}, ${now}, ${now})`
  );
}

export async function runBootstrap(): Promise<void> {
  await waitForDb();
  const globalOrgId = await ensureGlobalOrg();
  await ensureBootstrapAdmin(globalOrgId);

  if (config.seedData) {
    await seedDevData(globalOrgId);
  }

  if (config.seedAccessLogs) {
    await seedAccessLogs(SAST_TZ);
  }
}
