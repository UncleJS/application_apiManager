import { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyPassword } from "../auth";
import { query } from "../db";
import { buildError } from "../utils/errors";
import { buildCookie } from "../utils/cookies";
import { config } from "../config";
import { createSession, revokeSessionByToken, SESSION_COOKIE } from "../sessions";
import { parseCookies } from "../utils/cookies";
import { authenticate } from "../middleware/authenticate";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send(buildError("INVALID_REQUEST", "Invalid login payload"));
    }

    const { username, password } = parseResult.data;
    const rows = await query<any[]>(
      "SELECT u.id, u.username, u.password_hash, u.organization_id, r.name as role, s.name as status FROM users u JOIN roles r ON u.role_id = r.id JOIN user_statuses s ON u.status_id = s.id WHERE u.username = ?",
      [username]
    );

    if (!rows || rows.length === 0) {
      return reply.status(401).send(buildError("INVALID_CREDENTIALS", "Invalid username or password"));
    }

    const user = rows[0];
    if (user.status !== "active") {
      return reply.status(403).send(buildError("USER_ARCHIVED", "User is archived"));
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send(buildError("INVALID_CREDENTIALS", "Invalid username or password"));
    }

    const userAgentHeader = request.headers["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader.join(" ") : userAgentHeader;

    const token = await createSession({
      userId: user.id,
      userAgent,
      clientIp: request.ip,
      idleSeconds: config.sessionIdleSeconds,
      hardMaxSeconds: config.sessionHardMaxSeconds
    });

    reply.header(
      "Set-Cookie",
      buildCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        path: "/",
        maxAgeSeconds: config.sessionHardMaxSeconds
      })
    );

    return reply.send({ sessionToken: token });
  });

  app.get("/auth/me", { preHandler: authenticate() }, async (request, reply) => {
    const user = request.authUser!;
    return reply.send({ user });
  });

  app.post("/auth/logout", async (request, reply) => {
    const header = request.headers.authorization;
    const cookieToken = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    const token = header && header.startsWith("Bearer ") ? header.slice("Bearer ".length) : cookieToken;
    if (token) {
      await revokeSessionByToken(token);
    }

    reply.header(
      "Set-Cookie",
      buildCookie(SESSION_COOKIE, "", {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        path: "/",
        maxAgeSeconds: 0
      })
    );

    return reply.send({ ok: true });
  });
}
