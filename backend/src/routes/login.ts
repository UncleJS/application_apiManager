import { FastifyInstance } from "fastify";
import { DateTime } from "luxon";
import { query } from "../db";
import { verifyPassword, signToken } from "../auth";
import { buildCookie } from "../utils/cookies";

const TOKEN_COOKIE = "api_manager_token";

function isSafeReturnTo(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  if (!value.startsWith("/")) {
    return false;
  }
  if (value.startsWith("//")) {
    return false;
  }
  if (value.includes("://")) {
    return false;
  }
  return true;
}

function renderLoginPage(params: { error?: string; returnTo?: string }) {
  const errorBlock = params.error
    ? `<p style="color:#f6c453;font-weight:600;">${params.error}</p>`
    : "";
  const returnToInput = params.returnTo ? `<input type="hidden" name="returnTo" value="${params.returnTo}" />` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Manager Login</title>
    <style>
      body { font-family: system-ui, sans-serif; background:#0b0f14; color:#f4f7ff; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
      .card { background:#171f2b; border:1px solid rgba(244,247,255,0.12); padding:24px; border-radius:16px; width:min(420px, 90vw); box-shadow:0 18px 45px rgba(0,0,0,0.35); }
      label { font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#a7b2c6; display:block; margin-bottom:6px; }
      input { width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(244,247,255,0.12); background:#0f1520; color:#f4f7ff; margin-bottom:12px; }
      button { width:100%; padding:10px 16px; border-radius:10px; border:none; background:#2ec4b6; color:#041516; font-weight:600; cursor:pointer; }
      h1 { font-size:20px; margin:0 0 16px; }
      p { color:#a7b2c6; margin:0 0 16px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>API Login</h1>
      <p>Sign in to access this API.</p>
      ${errorBlock}
      <form method="post" action="/login">
        ${returnToInput}
        <label>Username</label>
        <input name="username" required />
        <label>Password</label>
        <input name="password" type="password" required />
        <button type="submit">Sign in</button>
      </form>
    </div>
  </body>
</html>`;
}

function parseFormBody(body: unknown): Record<string, string> {
  if (!body) {
    return {};
  }
  const raw = Buffer.isBuffer(body) ? body.toString("utf-8") : String(body);
  const params = new URLSearchParams(raw);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

export async function registerLoginRoutes(app: FastifyInstance) {
  app.get("/login", async (request, reply) => {
    const returnTo = isSafeReturnTo((request.query as any)?.returnTo)
      ? (request.query as any).returnTo
      : undefined;
    return reply.type("text/html").send(renderLoginPage({ returnTo }));
  });

  app.post("/login", async (request, reply) => {
    const form = parseFormBody(request.body);
    const returnTo = isSafeReturnTo(form.returnTo) ? form.returnTo : "/";
    if (!form.username || !form.password) {
      return reply.type("text/html").send(renderLoginPage({ error: "Missing credentials", returnTo }));
    }

    const rows = await query<any[]>(
      "SELECT u.id, u.username, u.password_hash, u.organization_id, r.name as role, s.name as status FROM users u JOIN roles r ON u.role_id = r.id JOIN user_statuses s ON u.status_id = s.id WHERE u.username = ?",
      [form.username]
    );

    if (!rows || rows.length === 0) {
      return reply.type("text/html").send(renderLoginPage({ error: "Invalid credentials", returnTo }));
    }

    const user = rows[0];
    if (user.status !== "active") {
      return reply.type("text/html").send(renderLoginPage({ error: "User is archived", returnTo }));
    }

    const valid = await verifyPassword(form.password, user.password_hash);
    if (!valid) {
      return reply.type("text/html").send(renderLoginPage({ error: "Invalid credentials", returnTo }));
    }

    const token = signToken({
      userId: user.id,
      role: user.role,
      organizationId: user.organization_id,
      username: user.username
    });

    const cookie = buildCookie(TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAgeSeconds: 12 * 60 * 60
    });

    reply.header("Set-Cookie", cookie);
    reply.redirect(returnTo || "/");
  });

  app.post("/logout", async (_request, reply) => {
    const cookie = buildCookie(TOKEN_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAgeSeconds: 0
    });
    reply.header("Set-Cookie", cookie);
    reply.redirect("/login");
  });
}
