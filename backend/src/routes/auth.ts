import { FastifyInstance } from "fastify";
import { z } from "zod";
import { signToken, verifyPassword } from "../auth";
import { query } from "../db";
import { buildError } from "../utils/errors";

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
      "SELECT u.id, u.password_hash, u.organization_id, r.name as role, s.name as status FROM users u JOIN roles r ON u.role_id = r.id JOIN user_statuses s ON u.status_id = s.id WHERE u.username = ?",
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

    const token = signToken({
      userId: user.id,
      role: user.role,
      organizationId: user.organization_id
    });

    return reply.send({ token });
  });
}
