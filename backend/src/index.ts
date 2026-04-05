import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { config } from "./config";
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
  await runBootstrap();

  const app = new Elysia()
    .use(
      swagger({
        path: "/docs",
        specPath: "/openapi.json",
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
      hostname: config.host
    });

  console.log(`API Manager internal HTTP running at http://${config.host}:${config.port}`);
  console.log("Public API/Swagger is expected via Caddy on https://localhost:55001");

  return app;
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
