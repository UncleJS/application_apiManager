import { DateTime } from "luxon";
import { query } from "./db";

export type ApiDefinition = {
  id: number;
  organization_id: number;
  name: string;
  base_path: string;
  target_url: string;
  is_public: number;
  is_enabled: number;
  always_on: number;
};

export type UserRecord = {
  id: number;
  organization_id: number;
  role: string;
  status: string;
};

export type AccessDecision = {
  allowed: boolean;
  reasonCode?: string;
  httpStatus?: number;
  user?: UserRecord | null;
  api?: ApiDefinition | null;
};

export const SAST_TZ = "Africa/Johannesburg";

export function getNowSast(): DateTime {
  return DateTime.now().setZone(SAST_TZ);
}

function parseTimeToMinutes(time: string): number {
  const [hour, minute, second] = time.split(":").map((value) => Number.parseInt(value, 10));
  return hour * 60 + minute + (second >= 30 ? 1 : 0);
}

async function fetchWindows(subjectType: "user" | "api", subjectId: number) {
  return query(
    "SELECT day_of_week, start_time, end_time, is_active FROM access_windows WHERE subject_type = ? AND subject_id = ?",
    [subjectType, subjectId]
  );
}

export async function isWithinWindows(subjectType: "user" | "api", subjectId: number, now: DateTime) {
  const rows = await fetchWindows(subjectType, subjectId);
  if (!rows || rows.length === 0) {
    return false;
  }

  const currentDay = now.weekday;
  const previousDay = currentDay === 1 ? 7 : currentDay - 1;
  const currentMinutes = now.hour * 60 + now.minute;

  for (const row of rows) {
    if (row.is_active === 0) {
      continue;
    }
    const startMinutes = parseTimeToMinutes(row.start_time);
    const endMinutes = parseTimeToMinutes(row.end_time);

    if (startMinutes <= endMinutes) {
      if (row.day_of_week === currentDay && currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
        return true;
      }
      continue;
    }

    if (row.day_of_week === currentDay && currentMinutes >= startMinutes) {
      return true;
    }
    if (row.day_of_week === previousDay && currentMinutes <= endMinutes) {
      return true;
    }
  }

  return false;
}

export async function getMatchingApi(pathname: string): Promise<ApiDefinition | null> {
  const rows = await query<ApiDefinition[]>(
    `SELECT *
     FROM api_definitions
     WHERE (base_path = '/' AND ? LIKE '/%')
       OR ? = base_path
       OR ? LIKE CONCAT(base_path, '/%')
     ORDER BY LENGTH(base_path) DESC
     LIMIT 1`,
    [pathname, pathname, pathname]
  );
  if (!rows || rows.length === 0) {
    return null;
  }
  return rows[0];
}
