import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import fs from "fs";
import { config, ensureTls } from "./config";
import { runBootstrap } from "./bootstrap";
import { authPlugin } from "./routes/auth";
import { orgsPlugin } from "./routes/orgs";
import { usersPlugin } from "./routes/users";
import { apisPlugin } from "./routes/apis";
import { permissionsPlugin } from "./routes/permissions";
import { windowsPlugin } from "./routes/windows";
import { reportsPlugin } from "./routes/reports";
import { sessionsPlugin } from "./routes/sessions";
import { lookupsPlugin } from "./routes/lookups";
import { authenticatePlugin } from "./middleware/authenticate";
import { handleProxy } from "./proxy";

async function start() {
  ensureTls(config.tls.certPath, config.tls.keyPath);
  await runBootstrap();

  const app = new Elysia()
    .use(
      swagger({
        path: "/docs",
        documentation: {
          info: {
            title: "API Manager",
            version: "2.0.0",
            description: "Reverse proxy manager with RBAC and time-window access control"
          },
          components: {
            securitySchemes: {
              bearerAuth: { type: "http", scheme: "bearer" }
            }
          }
        }
      })
    )
    .use(
      cors({
        origin: config.corsOrigin,
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"],
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
      })
    )
    .get("/", () => ({
      status: "ok",
      message: "API Manager backend is running",
      auth: "/auth/login",
      docs: "/docs"
    }))
    .get("/healthz", () => ({ status: "ok" }))
    // ── auth (public) ──────────────────────────────────────────────────────────
    .use(authPlugin)
    // ── protected routes ──────────────────────────────────────────────────────
    .use(authenticatePlugin)
    .use(orgsPlugin)
    .use(usersPlugin)
    .use(apisPlugin)
    .use(permissionsPlugin)
    .use(windowsPlugin)
    .use(reportsPlugin)
    .use(sessionsPlugin)
    .use(lookupsPlugin)
    // ── reverse proxy (catch-all) ─────────────────────────────────────────────
    .all("/*", handleProxy)
    .listen({
      port: config.port,
      hostname: config.host,
      tls: {
        key: fs.readFileSync(config.tls.keyPath),
        cert: fs.readFileSync(config.tls.certPath)
      }
    });

  console.log(`API Manager running at https://${config.host}:${config.port}`);
  console.log(`Swagger UI: https://${config.host}:${config.port}/docs`);

  return app;
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
