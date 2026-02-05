import { DateTime } from "luxon";
import { hashPassword } from "../auth";
import { pool, query, withConnection } from "../db";
import { nowUtc, toUtcSql } from "../utils/datetime";

const DEFAULT_PASSWORD = "001002..Ad";

async function getIdByName(table: string, name: string): Promise<number> {
  const rows = await query<{ id: number }[]>(`SELECT id FROM ${table} WHERE name = ?`, [name]);
  if (!rows || rows.length === 0) {
    throw new Error(`Missing ${table} row for ${name}`);
  }
  return rows[0].id;
}

async function ensureOrganization(name: string, statusId: number): Promise<number> {
  const now = nowUtc();
  await query(
    "INSERT IGNORE INTO organizations (name, status_id, created_at_utc, updated_at_utc) VALUES (?, ?, ?, ?)",
    [name, statusId, now, now]
  );
  const rows = await query<{ id: number }[]>("SELECT id FROM organizations WHERE name = ?", [name]);
  return rows[0].id;
}

async function ensureUser(params: {
  username: string;
  organizationId: number;
  roleId: number;
  statusId: number;
}): Promise<number> {
  const now = nowUtc();
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  await query(
    "INSERT IGNORE INTO users (username, password_hash, organization_id, role_id, status_id, created_at_utc, updated_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      params.username,
      passwordHash,
      params.organizationId,
      params.roleId,
      params.statusId,
      now,
      now
    ]
  );
  const rows = await query<{ id: number }[]>("SELECT id FROM users WHERE username = ?", [params.username]);
  return rows[0].id;
}

async function ensureApi(params: {
  organizationId: number;
  name: string;
  basePath: string;
  targetUrl: string;
  isPublic: boolean;
  isEnabled: boolean;
  alwaysOn: boolean;
}): Promise<number> {
  const now = nowUtc();
  await query(
    "INSERT IGNORE INTO api_definitions (organization_id, name, base_path, target_url, is_public, is_enabled, always_on, created_at_utc, updated_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      params.organizationId,
      params.name,
      params.basePath,
      params.targetUrl,
      params.isPublic ? 1 : 0,
      params.isEnabled ? 1 : 0,
      params.alwaysOn ? 1 : 0,
      now,
      now
    ]
  );
  const rows = await query<{ id: number }[]>(
    "SELECT id FROM api_definitions WHERE organization_id = ? AND base_path = ?",
    [params.organizationId, params.basePath]
  );
  return rows[0].id;
}

async function replaceWindows(subjectType: "user" | "api", subjectId: number, windows: Array<{ day: number; start: string; end: string }>) {
  await query("DELETE FROM access_windows WHERE subject_type = ? AND subject_id = ?", [subjectType, subjectId]);
  const now = nowUtc();
  for (const window of windows) {
    await query(
      "INSERT INTO access_windows (subject_type, subject_id, day_of_week, start_time, end_time, is_active, created_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [subjectType, subjectId, window.day, window.start, window.end, 1, now]
    );
  }
}

async function replaceAssignments(userId: number, apiIds: number[]) {
  await query("DELETE FROM user_api_permissions WHERE user_id = ?", [userId]);
  const now = nowUtc();
  for (const apiId of apiIds) {
    await query(
      "INSERT INTO user_api_permissions (user_id, api_id, created_at_utc) VALUES (?, ?, ?)",
      [userId, apiId, now]
    );
  }
}

export async function seedDevData(globalOrgId: number): Promise<void> {
  const orgStatusId = await getIdByName("organization_statuses", "active");
  const userStatusId = await getIdByName("user_statuses", "active");
  const globalAdminRoleId = await getIdByName("roles", "global_admin");
  const orgAdminRoleId = await getIdByName("roles", "org_admin");
  const userRoleId = await getIdByName("roles", "user");

  const acmeOrgId = await ensureOrganization("Acme", orgStatusId);
  const globexOrgId = await ensureOrganization("Globex", orgStatusId);

  await ensureUser({ username: "global-admin", organizationId: globalOrgId, roleId: globalAdminRoleId, statusId: userStatusId });
  const acmeAdminId = await ensureUser({ username: "acme-admin", organizationId: acmeOrgId, roleId: orgAdminRoleId, statusId: userStatusId });
  const acmeUserId = await ensureUser({ username: "acme-user", organizationId: acmeOrgId, roleId: userRoleId, statusId: userStatusId });
  const globexAdminId = await ensureUser({ username: "globex-admin", organizationId: globexOrgId, roleId: orgAdminRoleId, statusId: userStatusId });
  const globexUserId = await ensureUser({ username: "globex-user", organizationId: globexOrgId, roleId: userRoleId, statusId: userStatusId });

  const acmeOrdersApi = await ensureApi({
    organizationId: acmeOrgId,
    name: "Acme Orders",
    basePath: "/acme/orders",
    targetUrl: "https://example.com/acme/orders",
    isPublic: false,
    isEnabled: true,
    alwaysOn: false
  });
  const acmeInventoryApi = await ensureApi({
    organizationId: acmeOrgId,
    name: "Acme Inventory",
    basePath: "/acme/inventory",
    targetUrl: "https://example.com/acme/inventory",
    isPublic: true,
    isEnabled: true,
    alwaysOn: true
  });
  const globexBillingApi = await ensureApi({
    organizationId: globexOrgId,
    name: "Globex Billing",
    basePath: "/globex/billing",
    targetUrl: "https://example.com/globex/billing",
    isPublic: false,
    isEnabled: true,
    alwaysOn: false
  });
  const globexAnalyticsApi = await ensureApi({
    organizationId: globexOrgId,
    name: "Globex Analytics",
    basePath: "/globex/analytics",
    targetUrl: "https://example.com/globex/analytics",
    isPublic: true,
    isEnabled: true,
    alwaysOn: false
  });
  const globalPublicApi = await ensureApi({
    organizationId: globalOrgId,
    name: "Global Public",
    basePath: "/global/public",
    targetUrl: "https://example.com/global/public",
    isPublic: true,
    isEnabled: true,
    alwaysOn: true
  });

  const weekdayWindows = [
    { day: 1, start: "08:00", end: "12:00" },
    { day: 1, start: "13:00", end: "17:00" },
    { day: 2, start: "08:00", end: "12:00" },
    { day: 2, start: "13:00", end: "17:00" },
    { day: 3, start: "08:00", end: "12:00" },
    { day: 3, start: "13:00", end: "17:00" },
    { day: 4, start: "08:00", end: "12:00" },
    { day: 4, start: "13:00", end: "17:00" },
    { day: 5, start: "08:00", end: "12:00" },
    { day: 5, start: "13:00", end: "17:00" }
  ];

  const apiWindows = [
    { day: 1, start: "07:00", end: "19:00" },
    { day: 2, start: "07:00", end: "19:00" },
    { day: 3, start: "07:00", end: "19:00" },
    { day: 4, start: "07:00", end: "19:00" },
    { day: 5, start: "07:00", end: "19:00" }
  ];

  await replaceWindows("user", acmeAdminId, weekdayWindows);
  await replaceWindows("user", acmeUserId, weekdayWindows);
  await replaceWindows("user", globexAdminId, weekdayWindows);
  await replaceWindows("user", globexUserId, weekdayWindows);

  await replaceWindows("api", acmeOrdersApi, apiWindows);
  await replaceWindows("api", globexBillingApi, apiWindows);
  await replaceWindows("api", globexAnalyticsApi, apiWindows);

  await replaceAssignments(acmeAdminId, [acmeOrdersApi, acmeInventoryApi]);
  await replaceAssignments(acmeUserId, [acmeOrdersApi, acmeInventoryApi]);
  await replaceAssignments(globexAdminId, [globexBillingApi, globexAnalyticsApi]);
  await replaceAssignments(globexUserId, [globexBillingApi, globexAnalyticsApi]);

  await replaceAssignments(acmeAdminId, [acmeOrdersApi, acmeInventoryApi, globalPublicApi]);
  await replaceAssignments(globexAdminId, [globexBillingApi, globexAnalyticsApi, globalPublicApi]);
}

export async function seedAccessLogs(timezone: string): Promise<void> {
  const existing = await query<{ count: number }[]>("SELECT COUNT(*) as count FROM access_logs");
  if (existing && existing[0]?.count > 0) {
    return;
  }

  const denyReasons = await query<{ id: number; code: string }[]>("SELECT id, code FROM deny_reasons");
  const denyReasonMap = new Map(denyReasons.map((row) => [row.code, row.id]));

  const apis = await query<{ id: number; organization_id: number; base_path: string }[]>(
    "SELECT id, organization_id, base_path FROM api_definitions"
  );
  const users = await query<{ id: number; organization_id: number; role: string }[]>(
    "SELECT u.id, u.organization_id, r.name as role FROM users u JOIN roles r ON u.role_id = r.id"
  );

  if (!apis.length || !users.length) {
    return;
  }

  const usersByOrg = new Map<number, Array<{ id: number; role: string }>>();
  for (const user of users) {
    const list = usersByOrg.get(user.organization_id) ?? [];
    list.push({ id: user.id, role: user.role });
    usersByOrg.set(user.organization_id, list);
  }

  const start = DateTime.fromISO("2025-01-01", { zone: timezone }).startOf("day");
  const end = DateTime.fromISO("2026-02-03", { zone: timezone }).endOf("day");

  const days: DateTime[] = [];
  for (let day = start; day <= end; day = day.plus({ days: 1 })) {
    days.push(day);
  }
  const weekdays = days.filter((day) => day.weekday <= 5);
  const weekends = days.filter((day) => day.weekday >= 6);

  const totalRows = 250000;
  const batchSize = 1000;
  let nextLogAt = 10000;

  const denyMix = [
    { code: "USER_OUTSIDE_ALLOWED_HOURS", weight: 0.5 },
    { code: "USER_NOT_ASSIGNED_TO_API", weight: 0.25 },
    { code: "API_OUTSIDE_ALLOWED_HOURS", weight: 0.15 },
    { code: "AUTH_REQUIRED", weight: 0.1 }
  ];

  function pickDenyReason(): string {
    const roll = Math.random();
    let cumulative = 0;
    for (const reason of denyMix) {
      cumulative += reason.weight;
      if (roll <= cumulative) {
        return reason.code;
      }
    }
    return denyMix[0].code;
  }

  function pickDay(): DateTime {
    const useWeekday = Math.random() < 0.8;
    const bucket = useWeekday ? weekdays : weekends;
    return bucket[Math.floor(Math.random() * bucket.length)];
  }

  function pickTime(day: DateTime): DateTime {
    const inBusinessHours = Math.random() < 0.6;
    const hour = inBusinessHours
      ? 9 + Math.floor(Math.random() * 9)
      : Math.floor(Math.random() * 24);
    const minute = Math.floor(Math.random() * 60);
    const second = Math.floor(Math.random() * 60);
    return day.set({ hour, minute, second });
  }

  function randomIp(): string {
    return `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(
      Math.random() * 255
    )}`;
  }

  const methods = ["GET", "POST", "PUT", "PATCH"];

  await withConnection(async (connection) => {
    let inserted = 0;
    while (inserted < totalRows) {
      const batch: any[] = [];
      const batchCount = Math.min(batchSize, totalRows - inserted);
      for (let i = 0; i < batchCount; i += 1) {
        const api = apis[Math.floor(Math.random() * apis.length)];
        const orgUsers = usersByOrg.get(api.organization_id) ?? users;
        const user = orgUsers[Math.floor(Math.random() * orgUsers.length)];
        const method = methods[Math.floor(Math.random() * methods.length)];

        const isDenied = Math.random() < 0.03;
        const denyReason = isDenied ? pickDenyReason() : null;
        const denyReasonId = denyReason ? denyReasonMap.get(denyReason) ?? null : null;

        const day = pickDay();
        const time = pickTime(day);
        const createdAtUtc = toUtcSql(time);

        const requestBytes = isDenied
          ? 100 + Math.floor(Math.random() * 1900)
          : 200 + Math.floor(Math.random() * 3800);
        const responseBytes = isDenied
          ? 100 + Math.floor(Math.random() * 1900)
          : 500 + Math.floor(Math.random() * 49500);
        const responseHeaderBytes = isDenied
          ? 200 + Math.floor(Math.random() * 600)
          : 300 + Math.floor(Math.random() * 1200);

        const status = denyReason === "AUTH_REQUIRED" ? 401 : isDenied ? 403 : 200;

        const userId = denyReason === "AUTH_REQUIRED" ? null : user.id;
        const path = `${api.base_path}/resource/${Math.floor(Math.random() * 10000)}`;

        const durationMs = 10 + Math.floor(Math.random() * 1990);

        batch.push([
          api.organization_id,
          userId,
          api.id,
          method,
          path,
          status,
          requestBytes,
          responseBytes,
          responseHeaderBytes,
          durationMs,
          randomIp(),
          denyReasonId,
          createdAtUtc
        ]);
      }

      await connection.batch(
        "INSERT INTO access_logs (organization_id, user_id, api_id, method, path, status, request_bytes, response_bytes, response_header_bytes, duration_ms, client_ip, deny_reason_id, created_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        batch
      );

      inserted += batchCount;
      if (inserted >= nextLogAt) {
        console.log(`Seeded access logs: ${inserted}/${totalRows}`);
        nextLogAt += 10000;
      }
    }
  });
}

async function ensureGlobalOrgId(): Promise<number> {
  const statusId = await getIdByName("organization_statuses", "active");
  const now = nowUtc();
  await query(
    "INSERT IGNORE INTO organizations (name, status_id, created_at_utc, updated_at_utc) VALUES (?, ?, ?, ?)",
    ["Global", statusId, now, now]
  );
  const rows = await query<{ id: number }[]>("SELECT id FROM organizations WHERE name = ?", ["Global"]);
  return rows[0].id;
}

async function runSeed() {
  const seedData = process.env.SEED_DATA === "true";
  const seedAccess = process.env.SEED_ACCESS_LOGS === "true";
  if (!seedData && !seedAccess) {
    return;
  }

  const globalOrgId = await ensureGlobalOrgId();
  if (seedData) {
    await seedDevData(globalOrgId);
  }
  if (seedAccess) {
    await seedAccessLogs("Africa/Johannesburg");
  }
}

if (require.main === module) {
  (async () => {
    try {
      await runSeed();
      process.exitCode = 0;
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  })();
}
