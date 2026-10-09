export const DEFAULT_LIST_LIMIT = 200;
export const MAX_LIST_LIMIT = 500;

export function resolveListLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") {
    return DEFAULT_LIST_LIMIT;
  }
  const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_LIST_LIMIT;
  }
  return Math.min(Math.floor(parsed), MAX_LIST_LIMIT);
}
