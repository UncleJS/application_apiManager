import { Elysia } from "elysia";
import { buildError } from "../utils/errors";
import { buildCookie, parseCookies } from "../utils/cookies";
import { config } from "../config";
import { getSessionUser, isSessionExpired, revokeSession, SESSION_COOKIE, touchSession } from "../sessions";

export type AuthUser = {
  id: number;
  role: string;
  organizationId: number;
  username?: string;
};

function normalizeRole(role: string | null | undefined): string {
  if (!role) {
    return "";
  }
  return role.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export const authenticatePlugin = new Elysia({ name: "authenticate" }).derive(
  { as: "global" },
  async ({ headers, set }) => {
    const authHeader = headers.authorization;
    const cookieToken = parseCookies(headers.cookie)[SESSION_COOKIE];
    const token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : cookieToken;
    const source =
      authHeader && authHeader.startsWith("Bearer ")
        ? "header"
        : cookieToken
          ? "cookie"
          : undefined;

    if (!token) {
      set.status = 401;
      return { authUser: null as AuthUser | null, _authError: buildError("AUTH_REQUIRED", "Authorization required") };
    }

    const session = await getSessionUser(token);
    if (!session) {
      set.status = 401;
      return { authUser: null as AuthUser | null, _authError: buildError("INVALID_TOKEN", "Invalid token") };
    }

    if (session.status !== "active") {
      set.status = 403;
      return { authUser: null as AuthUser | null, _authError: buildError("USER_ARCHIVED", "User is archived") };
    }

    if (isSessionExpired(session, config.sessionIdleSeconds, config.sessionHardMaxSeconds)) {
      await revokeSession(session.session_id);
      if (source === "cookie") {
        set.headers["Set-Cookie"] = buildCookie(SESSION_COOKIE, "", {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          path: "/",
          maxAgeSeconds: 0
        });
      }
      set.status = 401;
      return { authUser: null as AuthUser | null, _authError: buildError("SESSION_EXPIRED", "Session expired") };
    }

    await touchSession(session.session_id);
    return {
      authUser: {
        id: session.user_id,
        role: normalizeRole(session.role),
        organizationId: session.organization_id,
        username: session.username
      } as AuthUser,
      _authError: null
    };
  }
);
