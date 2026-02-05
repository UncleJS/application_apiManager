import crypto from "crypto";
import { DateTime } from "luxon";
import { query } from "./db";
import { nowUtc, toUtcSql } from "./utils/datetime";

export const SESSION_COOKIE = "api_manager_session";

export type SessionUser = {
  session_id: number;
  user_id: number;
  username: string;
  organization_id: number;
  role: string;
  status: string;
  last_activity_utc: string;
  expires_at_utc: string;
  revoked_at_utc: string | null;
};

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function createSession(params: {
  userId: number;
  userAgent?: string;
  clientIp?: string;
  idleSeconds: number;
  hardMaxSeconds: number;
}): Promise<string> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const now = DateTime.utc();
  const createdAt = nowUtc();
  const lastActivity = createdAt;
  const expiresAt = toUtcSql(now.plus({ seconds: params.hardMaxSeconds }));

  await query(
    "INSERT INTO sessions (session_token_hash, user_id, created_at_utc, last_activity_utc, expires_at_utc, user_agent, client_ip) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [tokenHash, params.userId, createdAt, lastActivity, expiresAt, params.userAgent ?? null, params.clientIp ?? null]
  );

  return token;
}

export async function getSessionUser(token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token);
  const rows = await query<SessionUser[]>(
    "SELECT s.id as session_id, s.user_id, s.last_activity_utc, s.expires_at_utc, s.revoked_at_utc, u.username, u.organization_id, r.name as role, us.name as status FROM sessions s JOIN users u ON s.user_id = u.id JOIN roles r ON u.role_id = r.id JOIN user_statuses us ON u.status_id = us.id WHERE s.session_token_hash = ?",
    [tokenHash]
  );
  if (!rows || rows.length === 0) {
    return null;
  }
  return rows[0];
}

export async function touchSession(sessionId: number): Promise<void> {
  await query("UPDATE sessions SET last_activity_utc = ? WHERE id = ?", [nowUtc(), sessionId]);
}

export async function revokeSession(sessionId: number): Promise<void> {
  await query("UPDATE sessions SET revoked_at_utc = ? WHERE id = ?", [nowUtc(), sessionId]);
}

export async function revokeSessionByToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await query("UPDATE sessions SET revoked_at_utc = ? WHERE session_token_hash = ?", [nowUtc(), tokenHash]);
}

export function isSessionExpired(session: SessionUser, idleSeconds: number, hardMaxSeconds: number): boolean {
  if (session.revoked_at_utc) {
    return true;
  }
  const now = DateTime.utc();
  const lastActivity = DateTime.fromSQL(session.last_activity_utc, { zone: "utc" });
  const expiresAt = DateTime.fromSQL(session.expires_at_utc, { zone: "utc" });
  if (now > expiresAt) {
    return true;
  }
  const idle = now.diff(lastActivity, "seconds").seconds;
  return idle > idleSeconds;
}
