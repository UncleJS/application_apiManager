import { Elysia, t } from "elysia";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { verifyAgainstDummy, verifyPassword } from "../auth";
import { buildError } from "../utils/errors";
import { buildCookie, parseCookies } from "../utils/cookies";
import { config } from "../config";
import { clearLoginFailures, isLoginLimited, loginAttemptKey, loginClientIp, recordLoginFailure } from "../utils/loginLimit";
import { createSession, revokeSessionByToken, SESSION_COOKIE } from "../sessions";
import { authenticatePlugin } from "../middleware/authenticate";
import { OkResponse, MeResponse, ErrorResponse } from "../schemas/responses";

type LoginRow = {
  id: number;
  username: string;
  password_hash: string;
  organization_id: number;
  role: string;
  status: string;
};

export const authPlugin = new Elysia({ prefix: "/auth" })
  .post(
    "/login",
    async ({ body, set, headers, server, request }) => {
      const forwardedForHeader = headers["x-forwarded-for"];
      const clientIpHeader = Array.isArray(forwardedForHeader) ? forwardedForHeader[0] : forwardedForHeader;
      const peer = server?.requestIP(request)?.address;
      const clientIp = loginClientIp(peer, clientIpHeader);
      const attemptKey = loginAttemptKey(clientIp, body.username);
      if (isLoginLimited(attemptKey)) {
        set.status = 429;
        return buildError("RATE_LIMITED", "Too many login attempts. Try again later.");
      }

      const rows = await db.execute(
        sql`SELECT u.id, u.username, u.password_hash, u.organization_id, r.name as role, s.name as status FROM users u JOIN roles r ON u.role_id = r.id JOIN user_statuses s ON u.status_id = s.id WHERE u.username = ${body.username}`
      );
      const data = rows[0] as unknown as LoginRow[];

      if (!data || data.length === 0) {
        await verifyAgainstDummy(body.password);
        recordLoginFailure(attemptKey);
        set.status = 401;
        return buildError("INVALID_CREDENTIALS", "Invalid username or password");
      }

      const user = data[0];
      const valid = await verifyPassword(body.password, user.password_hash);
      if (!valid || user.status !== "active") {
        recordLoginFailure(attemptKey);
        set.status = 401;
        return buildError("INVALID_CREDENTIALS", "Invalid username or password");
      }

      clearLoginFailures(attemptKey);

      const userAgentHeader = headers["user-agent"];
      const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader.join(" ") : userAgentHeader;

      const token = await createSession({
        userId: user.id,
        userAgent,
        clientIp,
        idleSeconds: config.sessionIdleSeconds,
        hardMaxSeconds: config.sessionHardMaxSeconds
      });

      set.headers["Set-Cookie"] = buildCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
        path: "/",
        maxAgeSeconds: config.sessionHardMaxSeconds
      });

      return { ok: true };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 1 }),
        password: t.String({ minLength: 1 })
      }),
      response: { 200: OkResponse, 401: ErrorResponse, 429: ErrorResponse }
    }
  )
  .use(authenticatePlugin)
  .get("/me", ({ authUser, _authError, set }) => {
    if (!authUser) {
      set.status = 401;
      return _authError!;
    }
    return { user: authUser };
  }, { response: { 200: MeResponse, 401: ErrorResponse } })
  .post("/logout", async ({ headers, set }) => {
    const authHeaderValue = headers.authorization;
    const authHeader = Array.isArray(authHeaderValue) ? authHeaderValue[0] : authHeaderValue;
    const cookieHeader = Array.isArray(headers.cookie) ? headers.cookie[0] : headers.cookie;
    const cookieToken = parseCookies(cookieHeader)[SESSION_COOKIE];
    const token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : cookieToken;
    if (token) {
      await revokeSessionByToken(token);
    }

    set.headers["Set-Cookie"] = buildCookie(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      path: "/",
      maxAgeSeconds: 0
    });

    return { ok: true };
  }, { response: { 200: OkResponse } });
