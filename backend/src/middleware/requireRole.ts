import { FastifyReply, FastifyRequest } from "fastify";
import { buildError } from "../utils/errors";

export function requireRole(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send(buildError("AUTH_REQUIRED", "Authorization required"));
    }

    if (!roles.includes(user.role)) {
      return reply.status(403).send(buildError("FORBIDDEN", "Insufficient permissions"));
    }
  };
}
