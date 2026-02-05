import { DateTime } from "luxon";

const SQL_FORMAT = "yyyy-LL-dd HH:mm:ss";

export function nowUtc(): string {
  return DateTime.utc().toFormat(SQL_FORMAT);
}

export function toUtcSql(date: DateTime): string {
  return date.toUTC().toFormat(SQL_FORMAT);
}
