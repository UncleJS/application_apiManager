import { buildError } from "./utils/errors";
import { getMatchingApi, getNowSast, isWithinWindows, ApiDefinition, UserRecord } from "./access";
import { logAccess } from "./logging";
import { config } from "./config";
import { nowUtc } from "./utils/datetime";
import { buildCookie, parseCookies } from "./utils/cookies";
import { getSessionUser, isSessionExpired, revokeSession, SESSION_COOKIE, touchSession } from "./sessions";
import { db } from "./db/client";
import { sql } from "drizzle-orm";
import { assertSafeTargetUrl } from "./utils/network";

const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "content-type",
  "if-match",
  "if-none-match",
  "if-modified-since",
  "pragma",
  "range",
  "user-agent",
  "x-requested-with",
  "x-correlation-id",
  "x-request-id"
]);

function isLoopbackAddress(remoteAddr?: string): boolean {
  if (!remoteAddr) {
    return false;
  }

  const value = remoteAddr.startsWith("::ffff:") ? remoteAddr.slice(7) : remoteAddr;
  return value === "127.0.0.1" || value === "::1";
}

function joinPaths(basePath: string, suffix: string): string {
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const extra = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${base}${extra === "/" ? "" : extra}`;
}

function getClientIp(headers: Record<string, string | string[] | undefined>, remoteAddr?: string): string {
  const header = headers["x-forwarded-for"] as string | undefined;
  if (header && isLoopbackAddress(remoteAddr)) {
    return header.split(",")[0].trim();
  }
  return remoteAddr ?? "unknown";
}

export function filterProxyHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const proxyHeaders: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (!value || !FORWARDED_REQUEST_HEADERS.has(lowerKey)) {
      continue;
    }
    proxyHeaders[lowerKey] = Array.isArray(value) ? value.join(",") : String(value);
  }

  return proxyHeaders;
}

async function readBodyWithLimit(request: Request, maxBytes: number): Promise<Buffer | undefined> {
  if (["GET", "HEAD"].includes(request.method) || !request.body) {
    return undefined;
  }

  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error("REQUEST_TOO_LARGE");
    }

    chunks.push(chunk);
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

async function readResponseWithLimit(response: Response, maxBytes: number): Promise<{ body: Buffer; responseBytes: number }> {
  if (!response.body) {
    return { body: Buffer.alloc(0), responseBytes: 0 };
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error("RESPONSE_TOO_LARGE");
    }

    chunks.push(chunk);
  }

  return { body: Buffer.concat(chunks), responseBytes: total };
}

function computeHeaderBytes(headers: Record<string, string>): number {
  let total = 0;
  for (const [key, value] of Object.entries(headers)) {
    total += Buffer.byteLength(`${key}: ${value}\r\n`);
  }
  total += 2;
  return total;
}

async function isAssigned(userId: number, apiId: number): Promise<boolean> {
  const rows = await db.execute(
    sql`SELECT id FROM user_api_permissions WHERE user_id = ${userId} AND api_id = ${apiId}`
  );
  const data = rows[0] as unknown as { id: number }[];
  return data && data.length > 0;
}

async function authorize(
  api: ApiDefinition,
  headers: Record<string, string | string[] | undefined>
): Promise<{
  allowed: boolean;
  reason?: { code: string; status: number; message: string; details?: Record<string, unknown> };
  user: UserRecord | null;
}> {
  const authHeader = headers.authorization as string | undefined;
  let user: UserRecord | null = null;
  const cookieToken = parseCookies(headers.cookie as string | undefined)[SESSION_COOKIE];
  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : cookieToken;
  let sessionId: number | null = null;

  if (token) {
    const session = await getSessionUser(token);
    if (!session) {
      return { allowed: false, reason: { code: "INVALID_TOKEN", status: 401, message: "Invalid token" }, user: null };
    }
    if (session.status !== "active") {
      return { allowed: false, reason: { code: "USER_ARCHIVED", status: 403, message: "User archived" }, user: null };
    }
    if (isSessionExpired(session, config.sessionIdleSeconds, config.sessionHardMaxSeconds)) {
      await revokeSession(session.session_id);
      return { allowed: false, reason: { code: "SESSION_EXPIRED", status: 401, message: "Session expired" }, user: null };
    }
    user = {
      id: session.user_id,
      organization_id: session.organization_id,
      role: session.role,
      status: session.status
    };
    sessionId = session.session_id;
    await touchSession(sessionId);
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

export async function handleProxy(context: {
  request: Request;
  set: { status?: number | string; headers: Record<string, string | number> };
  headers: Record<string, string | undefined>;
  server?: { requestIP?: (request: Request) => { address?: string } | null | undefined } | null;
}) {
  const { request, set, headers, server } = context;
  const start = Date.now();
  const url = new URL(request.url);
  const remoteAddress = server?.requestIP?.(request)?.address;
  const api = await getMatchingApi(url.pathname);

  if (!api) {
    set.status = 404;
    return buildError("API_NOT_FOUND", "API not found", { path: url.pathname });
  }

  const decision = await authorize(api, headers);
  if (!decision.allowed) {
    const status = decision.reason!.status;
    if (
      decision.reason!.code === "AUTH_REQUIRED" ||
      decision.reason!.code === "SESSION_EXPIRED" ||
      decision.reason!.code === "INVALID_TOKEN"
    ) {
      const accept = (headers.accept as string) || "";
      if (accept.includes("text/html")) {
        const returnTo = encodeURIComponent(`${url.pathname}${url.search}`);
        set.status = 302;
        set.headers["Location"] = `/login?returnTo=${returnTo}`;
        return;
      }
    }

    if (
      decision.reason!.code === "SESSION_EXPIRED" ||
      decision.reason!.code === "INVALID_TOKEN"
    ) {
      const cookieToken = parseCookies(headers.cookie as string | undefined)[SESSION_COOKIE];
      if (cookieToken) {
        set.headers["Set-Cookie"] = buildCookie(SESSION_COOKIE, "", {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          path: "/",
          maxAgeSeconds: 0
        });
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
      requestBytes: Number.parseInt(String(headers["content-length"] ?? 0), 10) || 0,
      responseBytes: Buffer.byteLength(responseBody),
      responseHeaderBytes: 0,
      durationMs: Date.now() - start,
      clientIp: getClientIp(headers, remoteAddress),
      denyReasonCode: decision.reason!.code,
      createdAtUtc: nowUtc()
    });
    set.status = status;
    return errorPayload;
  }

  const basePath = api.base_path;
  const suffix = url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) : url.pathname;
  const targetBase = new URL(api.target_url);
  const targetSafety = await assertSafeTargetUrl(api.target_url);
  if (!targetSafety.ok) {
    const errorPayload = buildError("UPSTREAM_FORBIDDEN", targetSafety.message);
    await logAccess({
      organizationId: api.organization_id,
      userId: decision.user?.id ?? null,
      apiId: api.id,
      method: request.method,
      path: url.pathname,
      status: 502,
      requestBytes: 0,
      responseBytes: Buffer.byteLength(JSON.stringify(errorPayload)),
      responseHeaderBytes: 0,
      durationMs: Date.now() - start,
      clientIp: getClientIp(headers, remoteAddress),
      denyReasonCode: null,
      createdAtUtc: nowUtc()
    });
    set.status = 502;
    return errorPayload;
  }

  targetBase.pathname = joinPaths(targetBase.pathname, suffix || "/");
  targetBase.search = url.search;

  const proxyHeaders = filterProxyHeaders(headers);
  proxyHeaders["x-forwarded-for"] = getClientIp(headers, remoteAddress);
  proxyHeaders["x-forwarded-proto"] = "https";

  let requestBytes = 0;
  let body: Buffer | undefined;

  try {
    body = await readBodyWithLimit(request, config.proxyMaxRequestBytes);
    requestBytes = body?.length ?? 0;
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      const errorPayload = buildError("REQUEST_TOO_LARGE", "Proxy request body exceeds the configured limit");
      await logAccess({
        organizationId: api.organization_id,
        userId: decision.user?.id ?? null,
        apiId: api.id,
        method: request.method,
        path: url.pathname,
        status: 413,
        requestBytes: config.proxyMaxRequestBytes,
        responseBytes: Buffer.byteLength(JSON.stringify(errorPayload)),
        responseHeaderBytes: 0,
        durationMs: Date.now() - start,
        clientIp: getClientIp(headers, remoteAddress),
        denyReasonCode: null,
        createdAtUtc: nowUtc()
      });
      set.status = 413;
      return errorPayload;
    }
    throw error;
  }

  try {
    const upstreamResponse = await fetch(targetBase.toString(), {
      method: request.method,
      headers: proxyHeaders,
      body,
      duplex: "half"
    } as RequestInit);

    const upstreamHeaders: Record<string, string> = {};
    upstreamResponse.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (["set-cookie", "transfer-encoding", "connection", "keep-alive"].includes(lowerKey)) {
        return;
      }
      upstreamHeaders[key] = value;
    });

    const responseHeaderBytes = computeHeaderBytes(upstreamHeaders);
    const { body: upstreamBody, responseBytes } = await readResponseWithLimit(
      upstreamResponse,
      config.proxyMaxResponseBytes
    );

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
      clientIp: getClientIp(headers, remoteAddress),
      denyReasonCode: null,
      createdAtUtc: nowUtc()
    });

    set.status = upstreamResponse.status;
    for (const [key, value] of Object.entries(upstreamHeaders)) {
      set.headers[key] = value;
    }
    return upstreamBody;
  } catch (error) {
    const errorPayload = buildError(
      error instanceof Error && error.message === "RESPONSE_TOO_LARGE"
        ? "RESPONSE_TOO_LARGE"
        : "UPSTREAM_ERROR",
      error instanceof Error && error.message === "RESPONSE_TOO_LARGE"
        ? "Upstream response body exceeds the configured limit"
        : "Upstream request failed"
    );
    const status = error instanceof Error && error.message === "RESPONSE_TOO_LARGE" ? 502 : 502;
    await logAccess({
      organizationId: api.organization_id,
      userId: decision.user?.id ?? null,
      apiId: api.id,
      method: request.method,
      path: url.pathname,
      status,
      requestBytes,
      responseBytes: Buffer.byteLength(JSON.stringify(errorPayload)),
      responseHeaderBytes: 0,
      durationMs: Date.now() - start,
      clientIp: getClientIp(headers, remoteAddress),
      denyReasonCode: null,
      createdAtUtc: nowUtc()
    });
    set.status = status;
    return errorPayload;
  }
}
