export type JwtPayload = {
  userId: number;
  role: string;
  organizationId: number;
  username?: string;
  exp: number;
};

export function parseJwt(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split(".");
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const decoded = atob(`${normalized}${padding}`);
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}
