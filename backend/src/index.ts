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
import type { ProtectedContext } from "./types/http";
import { pool } from "./db/client";
import { RootResponse, StatusResponse } from "./schemas/responses";

// Flipped true once bootstrap completes and the server is listening; gates /readyz.
let ready = false;

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
    }), { response: { 200: RootResponse } })
    // Liveness: process is up and serving. Cheap, no dependencies.
    .get("/healthz", () => ({ status: "ok" }), { response: { 200: StatusResponse } })
    // Readiness: only "ready" once bootstrap finished AND the DB answers. Lets the
    // orchestrator hold traffic until the schema/seed work is done, distinct from
    // liveness (a slow first boot is not a crash).
    .get("/readyz", async ({ set }) => {
      if (!ready) {
        set.status = 503;
        return { status: "starting" };
      }
      try {
        await pool.query("SELECT 1");
        return { status: "ok" };
      } catch {
        set.status = 503;
        return { status: "db_unavailable" };
      }
    }, { response: { 200: StatusResponse, 503: StatusResponse } })
    // ── auth (public) ──────────────────────────────────────────────────────────
    .use(authPlugin)
    // ── protected routes ──────────────────────────────────────────────────────
    .use(authenticatePlugin)
    // Authoritative auth gate: `authenticatePlugin` derives `authUser`/`_authError`
    // but (being global, it also runs for the public proxy) cannot itself abort.
    // This guard short-circuits any request that failed authentication BEFORE the
    // handler runs, so a route that forgets its own `if (!authUser)` check can
    // never reach handler logic with a null user. Per-route checks remain as
    // defense-in-depth. The status (401/403) is already set by the derive.
    .guard(
      {
        beforeHandle(context) {
          const { authUser, _authError, set } = context as unknown as ProtectedContext;
          if (!authUser) {
            if (!set.status || Number(set.status) < 400) {
              set.status = 401;
            }
            return _authError;
          }
        }
      },
      (app) =>
        app
          .use(orgsPlugin)
          .use(usersPlugin)
          .use(apisPlugin)
          .use(permissionsPlugin)
          .use(windowsPlugin)
          .use(reportsPlugin)
          .use(sessionsPlugin)
          .use(lookupsPlugin)
    )
    // ── reverse proxy (catch-all) ─────────────────────────────────────────────
    .all("/*", handleProxy)
    .listen({
      port: config.port,
      hostname: config.host
    });

  console.log(`API Manager internal HTTP running at http://${config.host}:${config.port}`);
  console.log("Public API/Swagger is expected via Caddy on https://localhost:55001");

  ready = true;

  // Graceful shutdown: stop accepting new requests, give in-flight work a brief
  // moment, then close the DB pool so connections drain cleanly. The Quadlet unit
  // sets TimeoutStopSec, which bounds how long systemd waits for this.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    ready = false;
    console.log(`Received ${signal}, shutting down gracefully…`);
    try {
      await app.stop();
      await pool.end();
    } catch (error) {
      console.error("Error during shutdown:", error);
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  return app;
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
