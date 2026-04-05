import { DateTime } from "luxon";

const SQL_FORMAT = "yyyy-LL-dd HH:mm:ss";

export function nowUtc(): string {
  return DateTime.utc().toFormat(SQL_FORMAT);
}

export function toUtcSql(date: DateTime): string {
  return date.toUTC().toFormat(SQL_FORMAT);
}

export function toUtcIso(value: string): string {
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
    if (key.endsWith("_utc") && typeof entryValue === "string") {
      return [key, toUtcIso(entryValue)];
    }

    if (Array.isArray(entryValue) || (entryValue && typeof entryValue === "object")) {
      return [key, serializeUtcFields(entryValue)];
    }

    return [key, entryValue];
  });

  return Object.fromEntries(entries) as T;
}
