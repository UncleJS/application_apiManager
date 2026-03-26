import { Elysia } from "elysia";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import type { ProtectedContext } from "../types/http";

export const lookupsPlugin = new Elysia({ prefix: "/lookups" })
  .get("/", async (context) => {
    const { authUser, _authError, set } = context as unknown as ProtectedContext;
    if (!authUser) { set.status = 401; return _authError; }
    const roles = await db.execute(sql`SELECT id, name FROM roles`);
    const userStatuses = await db.execute(sql`SELECT id, name FROM user_statuses`);
    const orgStatuses = await db.execute(sql`SELECT id, name FROM organization_statuses`);
    return {
      roles: roles[0],
      userStatuses: userStatuses[0],
      orgStatuses: orgStatuses[0]
    };
  });
