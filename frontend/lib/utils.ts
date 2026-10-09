import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseUtcDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? value.replace(" ", "T") + "Z"
    : value;

  const date = new Date(normalized);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Format a UTC date string or Date to SAST (Africa/Johannesburg) as "YYYY-MM-DD HH:mm"
 */
export function formatSast(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = parseUtcDate(value);
  if (!date) return "—";

  const formatter = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function normalizeRole(role: string | null | undefined): string {
  return String(role ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}
