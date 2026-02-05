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
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}
