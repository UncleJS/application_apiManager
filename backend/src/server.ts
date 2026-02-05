import fs from "fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { config, ensureTls } from "./config";
import { registerAuthRoutes } from "./routes/auth";
import { registerOrgRoutes } from "./routes/orgs";
import { registerUserRoutes } from "./routes/users";
import { registerApiRoutes } from "./routes/apis";
import { registerPermissionRoutes } from "./routes/permissions";
import { registerWindowRoutes } from "./routes/windows";
import { registerReportRoutes } from "./routes/reports";
import { registerLookupRoutes } from "./routes/lookups";
import { authenticate } from "./middleware/authenticate";
import { requireRole } from "./middleware/requireRole";
import { handleProxy } from "./proxy";

export async function buildServer() {
  ensureTls(config.tls.certPath, config.tls.keyPath);
  const https = {
    key: fs.readFileSync(config.tls.keyPath),
    cert: fs.readFileSync(config.tls.certPath)
  };

  const app = Fastify({
    logger: true,
    https
  });

  await app.register(cors, { origin: config.corsOrigin, credentials: true });

  app.get("/", async (_request, reply) => {
    return reply.send({
      status: "ok",
      message: "API Manager backend is running",
      auth: "/auth/login"
    });
  });

  app.get("/healthz", async (_request, reply) => {
    return reply.send({ status: "ok" });
  });

  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    try {
      const raw = typeof body === "string" ? body : body.toString("utf-8");
      const parsed = raw ? JSON.parse(raw) : {};
      done(null, parsed);
    } catch {
      done(new Error("Invalid JSON"));
    }
  });

  app.addContentTypeParser("*", { parseAs: "buffer" }, (request, body, done) => {
    done(null, body);
  });

  await registerAuthRoutes(app);

  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook("preHandler", authenticate());

    protectedRoutes.register(async (orgRoutes) => {
      orgRoutes.addHook("preHandler", requireRole(["global_admin"]));
      await registerOrgRoutes(orgRoutes);
    });

    protectedRoutes.register(async (userRoutes) => {
      userRoutes.addHook("preHandler", requireRole(["global_admin", "org_admin"]));
      await registerUserRoutes(userRoutes);
    });

    protectedRoutes.register(async (apiRoutes) => {
      apiRoutes.addHook("preHandler", requireRole(["global_admin", "org_admin", "user"]));
      await registerApiRoutes(apiRoutes);
    });

    protectedRoutes.register(async (permissionRoutes) => {
      permissionRoutes.addHook("preHandler", requireRole(["global_admin", "org_admin"]));
      await registerPermissionRoutes(permissionRoutes);
    });

    protectedRoutes.register(async (windowRoutes) => {
      windowRoutes.addHook("preHandler", requireRole(["global_admin", "org_admin"]));
      await registerWindowRoutes(windowRoutes);
    });

    protectedRoutes.register(async (reportRoutes) => {
      reportRoutes.addHook("preHandler", requireRole(["global_admin", "org_admin"]));
      await registerReportRoutes(reportRoutes);
    });

    protectedRoutes.register(async (lookupRoutes) => {
      await registerLookupRoutes(lookupRoutes);
    });
  });

  app.route({
    method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"],
    url: "/*",
    handler: handleProxy
  });

  return app;
}
