import { DateTime } from "luxon";

const SQL_FORMAT = "yyyy-LL-dd HH:mm:ss";
const BOOLEAN_KEYS = new Set(["is_public", "is_enabled", "always_on", "is_active"]);

export function nowUtc(): string {
  return DateTime.utc().toFormat(SQL_FORMAT);
}

export function toUtcSql(date: DateTime): string {
  return date.toUTC().toFormat(SQL_FORMAT);
}

export function toUtcIso(value: string | Date): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? value.toString() : value.toISOString();
  }

  const parsed = DateTime.fromSQL(value, { zone: "utc" });
  return parsed.isValid ? parsed.toUTC().toISO() ?? value : value;
}

export function serializeUtcFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => serializeUtcFields(item)) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
    if (key.endsWith("_utc") && (typeof entryValue === "string" || entryValue instanceof Date)) {
      return [key, toUtcIso(entryValue)];
    }

    if (BOOLEAN_KEYS.has(key) && (entryValue === 0 || entryValue === 1 || entryValue === "0" || entryValue === "1")) {
      return [key, Number(entryValue) === 1];
    }

    if (entryValue instanceof Date) {
      return [key, entryValue];
    }

    if (Array.isArray(entryValue) || (entryValue && typeof entryValue === "object")) {
      return [key, serializeUtcFields(entryValue)];
    }

    return [key, entryValue];
  });

  return Object.fromEntries(entries) as T;
}
