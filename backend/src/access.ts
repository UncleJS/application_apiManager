import { DateTime } from "luxon";
import { query } from "./db/index";

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

export type AccessWindowRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: number;
};

function parseTimeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map((value) => Number.parseInt(value, 10));
  return hour * 60 + minute;
}

async function fetchWindows(subjectType: "user" | "api", subjectId: number) {
  return query<AccessWindowRow[]>(
    "SELECT day_of_week, start_time, end_time, is_active FROM access_windows WHERE subject_type = ? AND subject_id = ?",
    [subjectType, subjectId]
  );
}

/**
 * Pure window evaluation: is `now` inside any active window in `rows`?
 * Handles midnight-spanning windows (start_time > end_time), where the active
 * range rolls over into the next calendar day, so the matching day for the tail
 * end is the PREVIOUS day-of-week. Extracted from the DB fetch so the tricky
 * rollover logic is unit-testable without a database.
 */
export function evaluateWindows(rows: AccessWindowRow[], now: DateTime): boolean {
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

export async function isWithinWindows(subjectType: "user" | "api", subjectId: number, now: DateTime) {
  const rows = await fetchWindows(subjectType, subjectId);
  return evaluateWindows(rows ?? [], now);
}

export async function getMatchingApi(pathname: string): Promise<ApiDefinition | null> {
  const rows = await query<ApiDefinition[]>(
    `SELECT *
     FROM api_definitions
     WHERE ? = base_path
       OR ? LIKE CONCAT(base_path, '/%')
     ORDER BY LENGTH(base_path) DESC
     LIMIT 1`,
    [pathname, pathname]
  );
  if (!rows || rows.length === 0) {
    return null;
  }
  return rows[0];
}
