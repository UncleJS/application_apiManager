import { FastifyReply, FastifyRequest } from "fastify";
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

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

export function authenticate() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    const cookieToken = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    const token = header && header.startsWith("Bearer ") ? header.slice("Bearer ".length) : cookieToken;
    const source = header && header.startsWith("Bearer ") ? "header" : cookieToken ? "cookie" : undefined;

    if (!token) {
      return reply.status(401).send(buildError("AUTH_REQUIRED", "Authorization required"));
    }

    const session = await getSessionUser(token);
    if (!session) {
      return reply.status(401).send(buildError("INVALID_TOKEN", "Invalid token"));
    }

    if (session.status !== "active") {
      return reply.status(403).send(buildError("USER_ARCHIVED", "User is archived"));
    }

    if (isSessionExpired(session, config.sessionIdleSeconds, config.sessionHardMaxSeconds)) {
      await revokeSession(session.session_id);
      if (source === "cookie") {
        reply.header(
          "Set-Cookie",
          buildCookie(SESSION_COOKIE, "", {
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
            path: "/",
            maxAgeSeconds: 0
          })
        );
      }
      return reply.status(401).send(buildError("SESSION_EXPIRED", "Session expired"));
    }

    await touchSession(session.session_id);
    request.authUser = {
      id: session.user_id,
      role: session.role,
      organizationId: session.organization_id,
      username: session.username
    };
  };
}
