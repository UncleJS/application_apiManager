/** Allow only a same-origin relative path. Protocol-relative and backslash paths are rejected. */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) {
    return "/apis";
  }
  return value;
}
