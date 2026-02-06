const SAST_TIMEZONE = "Africa/Johannesburg";

function toIsoUtc(sqlUtc: string): string {
  if (/[zZ]$/.test(sqlUtc) || /[+-]\d{2}:?\d{2}$/.test(sqlUtc)) {
    return sqlUtc;
  }
  if (sqlUtc.includes("T")) {
    return `${sqlUtc}Z`;
  }
  return `${sqlUtc.replace(" ", "T")}Z`;
}

export function isExpired(sqlUtc: string | null | undefined): boolean {
  if (!sqlUtc) {
    return false;
  }
  const date = new Date(toIsoUtc(sqlUtc));
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return date.getTime() <= Date.now();
}

export function getSessionStatus(session: { revoked_at_utc?: string | null; expires_at_utc?: string | null }):
  | "Active"
  | "Expired"
  | "Revoked" {
  if (session.revoked_at_utc) {
    return "Revoked";
  }
  if (isExpired(session.expires_at_utc)) {
    return "Expired";
  }
  return "Active";
}

export function formatSast(sqlUtc: string | null | undefined): string {
  if (!sqlUtc) {
    return "";
  }
  const date = new Date(toIsoUtc(sqlUtc));
  if (Number.isNaN(date.getTime())) {
    return sqlUtc;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  const lookup: Record<string, string> = {};
  for (const part of parts) {
    lookup[part.type] = part.value;
  }

  return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}`;
}
