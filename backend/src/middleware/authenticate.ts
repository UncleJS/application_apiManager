import { FastifyReply, FastifyRequest } from "fastify";
import { verifyToken } from "../auth";
import { buildError } from "../utils/errors";

export type AuthUser = {
  id: number;
  role: string;
  organizationId: number;
};

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

export function authenticate() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return reply.status(401).send(buildError("AUTH_REQUIRED", "Authorization required"));
    }

    const token = header.slice("Bearer ".length);
    try {
      const payload = verifyToken(token);
      request.authUser = {
        id: payload.userId,
        role: payload.role,
        organizationId: payload.organizationId
      };
    } catch {
      return reply.status(401).send(buildError("INVALID_TOKEN", "Invalid token"));
    }
  };
}
