function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }
  const entries = cookieHeader.split(";").map((part) => part.trim()).filter(Boolean);
  const cookies: Record<string, string> = {};
  for (const entry of entries) {
    const index = entry.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = entry.slice(0, index).trim();
    const value = entry.slice(index + 1).trim();
    if (!key) {
      continue;
    }
    cookies[key] = decodeCookieValue(value);
  }
  return cookies;
}

export function buildCookie(name: string, value: string, options: {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
  maxAgeSeconds?: number;
} = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }
  if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${options.maxAgeSeconds}`);
  }
  return parts.join("; ");
}
