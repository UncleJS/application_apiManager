import { FastifyReply, FastifyRequest } from "fastify";
import { PassThrough, Readable } from "stream";
import { pipeline } from "stream/promises";
import { buildError } from "./utils/errors";
import { getMatchingApi, getNowSast, isWithinWindows, ApiDefinition, UserRecord } from "./access";
import { logAccess } from "./logging";
import { verifyToken } from "./auth";
import { query } from "./db";
import { nowUtc } from "./utils/datetime";
import { parseCookies } from "./utils/cookies";

function joinPaths(basePath: string, suffix: string): string {
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const extra = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${base}${extra === "/" ? "" : extra}`;
}

function getClientIp(request: FastifyRequest): string {
  const header = request.headers["x-forwarded-for"] as string | undefined;
  if (header) {
    return header.split(",")[0].trim();
  }
  return request.ip;
}

function computeHeaderBytes(headers: Record<string, string>): number {
  let total = 0;
  for (const [key, value] of Object.entries(headers)) {
    total += Buffer.byteLength(`${key}: ${value}\r\n`);
  }
  total += 2;
  return total;
}

async function getUserRecord(userId: number): Promise<UserRecord | null> {
  const rows = await query<UserRecord[]>(
    "SELECT u.id, u.organization_id, r.name as role, s.name as status FROM users u JOIN roles r ON u.role_id = r.id JOIN user_statuses s ON u.status_id = s.id WHERE u.id = ?",
    [userId]
  );
  if (!rows || rows.length === 0) {
    return null;
  }
  return rows[0];
}

async function isAssigned(userId: number, apiId: number): Promise<boolean> {
  const rows = await query<any[]>("SELECT id FROM user_api_permissions WHERE user_id = ? AND api_id = ?", [userId, apiId]);
  return rows && rows.length > 0;
}

async function authorize(
  api: ApiDefinition,
  request: FastifyRequest
): Promise<{ allowed: boolean; reason?: { code: string; status: number; message: string; details?: Record<string, unknown> }; user: UserRecord | null }> {
  const authHeader = request.headers.authorization;
  let user: UserRecord | null = null;
  const cookieToken = parseCookies(request.headers.cookie)["api_manager_token"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : cookieToken;

  if (token) {
    try {
      const payload = verifyToken(token);
      user = await getUserRecord(payload.userId);
      if (!user) {
        return { allowed: false, reason: { code: "INVALID_TOKEN", status: 401, message: "Invalid token" }, user: null };
      }
    } catch {
      return { allowed: false, reason: { code: "INVALID_TOKEN", status: 401, message: "Invalid token" }, user: null };
    }
  }

  if (api.is_enabled === 0) {
    return { allowed: false, reason: { code: "API_DISABLED", status: 403, message: "API disabled" }, user };
  }

  if (user && user.role === "global_admin") {
    return { allowed: true, user };
  }

  const now = getNowSast();
  if (api.always_on === 0) {
    const inApiWindow = await isWithinWindows("api", api.id, now);
    if (!inApiWindow) {
      return {
        allowed: false,
        reason: { code: "API_OUTSIDE_ALLOWED_HOURS", status: 403, message: "API outside allowed hours" },
        user
      };
    }
  }

    if (api.is_public === 1) {
      return { allowed: true, user };
    }

    if (!user) {
    return { allowed: false, reason: { code: "AUTH_REQUIRED", status: 401, message: "Authorization required" }, user: null };
    }

  if (user.status !== "active") {
    return { allowed: false, reason: { code: "USER_ARCHIVED", status: 403, message: "User archived" }, user };
  }

  if (user.role !== "global_admin" && user.organization_id !== api.organization_id) {
    return { allowed: false, reason: { code: "USER_ORG_MISMATCH", status: 403, message: "Organization mismatch" }, user };
  }

  const inUserWindow = await isWithinWindows("user", user.id, now);
  if (!inUserWindow) {
    return {
      allowed: false,
      reason: { code: "USER_OUTSIDE_ALLOWED_HOURS", status: 403, message: "User outside allowed hours" },
      user
    };
  }

  const assigned = await isAssigned(user.id, api.id);
  if (!assigned) {
    return {
      allowed: false,
      reason: { code: "USER_NOT_ASSIGNED_TO_API", status: 403, message: "User not assigned" },
      user
    };
  }

  return { allowed: true, user };
}

export async function handleProxy(request: FastifyRequest, reply: FastifyReply) {
  const start = Date.now();
  const url = new URL(request.raw.url ?? "/", `https://${request.headers.host ?? "localhost"}`);
  const api = await getMatchingApi(url.pathname);
  if (!api) {
    const errorPayload = buildError("API_NOT_FOUND", "API not found", { path: url.pathname });
    return reply.status(404).send(errorPayload);
  }

  const decision = await authorize(api, request);
  if (!decision.allowed) {
    const status = decision.reason!.status;
    if (decision.reason!.code === "AUTH_REQUIRED") {
      const accept = request.headers.accept || "";
      if (accept.includes("text/html")) {
        const returnTo = encodeURIComponent(`${url.pathname}${url.search}`);
        return reply.redirect(`/login?returnTo=${returnTo}`);
      }
    }

    const errorPayload = buildError(decision.reason!.code, decision.reason!.message, decision.reason!.details ?? {});
    const responseBody = JSON.stringify(errorPayload);
    await logAccess({
      organizationId: api.organization_id,
      userId: decision.user?.id ?? null,
      apiId: api.id,
      method: request.method,
      path: url.pathname,
      status,
      requestBytes: Number.parseInt(String(request.headers["content-length"] ?? 0), 10) || 0,
      responseBytes: Buffer.byteLength(responseBody),
      responseHeaderBytes: 0,
      durationMs: Date.now() - start,
      clientIp: getClientIp(request),
      denyReasonCode: decision.reason!.code,
      createdAtUtc: nowUtc()
    });
    return reply.status(status).send(errorPayload);
  }

  const basePath = api.base_path;
  const suffix = url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) : url.pathname;
  const targetBase = new URL(api.target_url);
  const targetPath = joinPaths(targetBase.pathname, suffix || "/");
  targetBase.pathname = targetPath;
  targetBase.search = url.search;

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    if (!value) {
      continue;
    }
    headers[key] = Array.isArray(value) ? value.join(",") : value;
  }
  delete headers.host;
  delete headers["content-length"];

  let requestBytes = 0;
  let body: PassThrough | Buffer | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    if (Buffer.isBuffer(request.body)) {
      requestBytes = request.body.length;
      body = request.body;
    } else if (request.body) {
      const jsonBody = JSON.stringify(request.body);
      requestBytes = Buffer.byteLength(jsonBody);
      body = Buffer.from(jsonBody);
    } else {
      const passThrough = new PassThrough();
      request.raw.on("data", (chunk: Buffer) => {
        requestBytes += chunk.length;
      });
      request.raw.pipe(passThrough);
      body = passThrough;
    }
  }

  try {
    const upstreamResponse = await fetch(targetBase.toString(), {
      method: request.method,
      headers,
      body,
      duplex: "half"
    } as RequestInit);

    const upstreamHeaders: Record<string, string> = {};
    upstreamResponse.headers.forEach((value, key) => {
      upstreamHeaders[key] = value;
    });

    reply.raw.writeHead(upstreamResponse.status, upstreamHeaders);

    const responseHeaderBytes = computeHeaderBytes(upstreamHeaders);

    let responseBytes = 0;
    if (upstreamResponse.body) {
      const nodeStream = Readable.fromWeb(upstreamResponse.body as any);
      nodeStream.on("data", (chunk: Buffer) => {
        responseBytes += chunk.length;
      });
      await pipeline(nodeStream, reply.raw);
    } else {
      reply.raw.end();
    }

    await logAccess({
      organizationId: api.organization_id,
      userId: decision.user?.id ?? null,
      apiId: api.id,
      method: request.method,
      path: url.pathname,
      status: upstreamResponse.status,
      requestBytes,
      responseBytes,
      responseHeaderBytes,
      durationMs: Date.now() - start,
      clientIp: getClientIp(request),
      denyReasonCode: null,
      createdAtUtc: nowUtc()
    });

    return reply;
  } catch (error) {
    const errorPayload = buildError("UPSTREAM_ERROR", "Upstream request failed");
    await logAccess({
      organizationId: api.organization_id,
      userId: decision.user?.id ?? null,
      apiId: api.id,
      method: request.method,
      path: url.pathname,
      status: 502,
      requestBytes,
      responseBytes: Buffer.byteLength(JSON.stringify(errorPayload)),
      responseHeaderBytes: 0,
      durationMs: Date.now() - start,
      clientIp: getClientIp(request),
      denyReasonCode: "UPSTREAM_ERROR",
      createdAtUtc: nowUtc()
    });
    return reply.status(502).send(errorPayload);
  }
}
