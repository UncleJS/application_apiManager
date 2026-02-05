import { config } from "./config";
import { hashPassword } from "./auth";
import { query } from "./db";
import { seedDevData, seedAccessLogs } from "./scripts/seed";
import { SAST_TZ } from "./access";
import { nowUtc } from "./utils/datetime";

const GLOBAL_ORG_NAME = "Global";

async function getIdByName(table: string, name: string): Promise<number> {
  const rows = await query<{ id: number }[]>(`SELECT id FROM ${table} WHERE name = ?`, [name]);
  if (!rows || rows.length === 0) {
    throw new Error(`Missing ${table} row for ${name}`);
  }
  return rows[0].id;
}

export async function ensureGlobalOrg(): Promise<number> {
  const statusId = await getIdByName("organization_statuses", "active");
  const existing = await query<{ id: number }[]>("SELECT id FROM organizations WHERE name = ?", [GLOBAL_ORG_NAME]);
  if (existing && existing.length > 0) {
    return existing[0].id;
  }

  const now = nowUtc();
  await query(
    "INSERT INTO organizations (name, status_id, created_at_utc, updated_at_utc) VALUES (?, ?, ?, ?)",
    [GLOBAL_ORG_NAME, statusId, now, now]
  );

  const rows = await query<{ id: number }[]>("SELECT id FROM organizations WHERE name = ?", [GLOBAL_ORG_NAME]);
  return rows[0].id;
}

async function waitForDb(retries = 20, delayMs = 1500): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await query("SELECT 1");
      return;
    } catch {
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

  const existing = await query(
    "SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = ? LIMIT 1",
    ["global_admin"]
  );

  if (existing && existing.length > 0) {
    return;
  }

  const passwordHash = await hashPassword(config.bootstrapPassword);
  const now = nowUtc();
  await query(
    "INSERT INTO users (username, password_hash, organization_id, role_id, status_id, created_at_utc, updated_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ["global-admin", passwordHash, globalOrgId, roleId, statusId, now, now]
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
