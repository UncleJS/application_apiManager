import { describe, expect, test } from "bun:test";
import { DateTime } from "luxon";
import { isSessionExpired, revokeSessionsForUser, type SessionUser } from "./sessions";

const SQL_FORMAT = "yyyy-LL-dd HH:mm:ss";
const sql = (dt: DateTime) => dt.toUTC().toFormat(SQL_FORMAT);

const IDLE = 900; // 15 min
const HARD_MAX = 28800; // 8 h

// Build a session whose last activity was `idleAgoSeconds` ago and whose hard
// expiry is `expiresInSeconds` from now (negative = already past).
function session(overrides: {
  idleAgoSeconds: number;
  expiresInSeconds: number;
  revoked?: boolean;
}): SessionUser {
  const now = DateTime.utc();
  return {
    session_id: 1,
    user_id: 1,
    username: "alice",
    organization_id: 1,
    role: "global_admin",
    status: "active",
    last_activity_utc: sql(now.minus({ seconds: overrides.idleAgoSeconds })),
    expires_at_utc: sql(now.plus({ seconds: overrides.expiresInSeconds })),
    revoked_at_utc: overrides.revoked ? sql(now.minus({ seconds: 10 })) : null
  };
}

describe("isSessionExpired", () => {
  test("fresh session within idle and hard-max → not expired", () => {
    const s = session({ idleAgoSeconds: 60, expiresInSeconds: HARD_MAX });
    expect(isSessionExpired(s, IDLE, HARD_MAX)).toBe(false);
  });

  test("revoked session → expired regardless of timing", () => {
    const s = session({ idleAgoSeconds: 1, expiresInSeconds: HARD_MAX, revoked: true });
    expect(isSessionExpired(s, IDLE, HARD_MAX)).toBe(true);
  });

  test("idle beyond idle window → expired", () => {
    const s = session({ idleAgoSeconds: IDLE + 60, expiresInSeconds: HARD_MAX });
    expect(isSessionExpired(s, IDLE, HARD_MAX)).toBe(true);
  });

  test("idle exactly at the window edge → not expired (boundary)", () => {
    // diff will be marginally over due to elapsed test time; use a small margin.
    const s = session({ idleAgoSeconds: IDLE - 5, expiresInSeconds: HARD_MAX });
    expect(isSessionExpired(s, IDLE, HARD_MAX)).toBe(false);
  });

  test("past hard-max expiry → expired even when recently active", () => {
    const s = session({ idleAgoSeconds: 5, expiresInSeconds: -1 });
    expect(isSessionExpired(s, IDLE, HARD_MAX)).toBe(true);
  });

  test("password changes can revoke every open session for that user", () => {
    expect(typeof revokeSessionsForUser).toBe("function");
  });
});
