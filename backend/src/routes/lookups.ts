import { FastifyInstance } from "fastify";
import { query } from "../db";

export async function registerLookupRoutes(app: FastifyInstance) {
  app.get("/lookups", async (_request, reply) => {
    const roles = await query("SELECT id, name FROM roles");
    const userStatuses = await query("SELECT id, name FROM user_statuses");
    const orgStatuses = await query("SELECT id, name FROM organization_statuses");
    return reply.send({ roles, userStatuses, orgStatuses });
  });
}
