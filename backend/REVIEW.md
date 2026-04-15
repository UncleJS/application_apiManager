# Backend Architecture Review — api-manager
Reviewed: 2026-03-26 | Read-only | No modifications made

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
![Backend](https://img.shields.io/badge/backend-Bun%20%2B%20Elysia%20%2B%20Drizzle-f472b6)
![DB](https://img.shields.io/badge/db-MariaDB-003545)

## Table of Contents
- [1. Architecture Overview](#1-architecture-overview)
- [2. Strengths](#2-strengths)
- [3. Concrete Risks / Bugs](#3-concrete-risks--bugs)
- [4. Missing Tests and Documentation](#4-missing-tests-and-documentation)
- [5. Top-Priority Recommendations](#5-top-priority-recommendations)
- [Footer](#footer)

---

## 1. Architecture Overview

| Layer | Technology |
|---|---|
| Runtime | Bun (TypeScript, no compile step) |
| Framework | Elysia 1.1 with plugin-per-resource layout |
| Database | MariaDB/MySQL via mysql2 pool + Drizzle ORM |
| Auth | DB-backed sessions, SHA-256 token hash in cookie or Bearer header |
| Proxy | Custom catch-all handleProxy — buffers full response in memory |
| TLS | Self-signed cert auto-generated with openssl at startup |
| Docs | @elysiajs/swagger at /docs |

Request flow:
  Client => Elysia (TLS) => authenticatePlugin (derive, global)
         => route plugins (orgs / users / apis / ...)
         => catch-all (/*) => handleProxy
                               - getMatchingApi (raw SQL LIKE)
                               - authorize (session lookup, window checks)
                               - fetch(upstreamUrl) <- FULLY BUFFERED
                               - logAccess (INSERT)

Plugin registration order (index.ts):
  authPlugin (public) => authenticatePlugin (global derive) => protected plugins => catch-all proxy

DB split — two patterns coexist:
  - src/db/client.ts (Drizzle + mysql2 pool) — routes, logging, bootstrap
  - import { query } from './db' — sessions.ts and access.ts (THIS MODULE IS MISSING — see R1)

[Go to TOC](#table-of-contents)

---

## 2. Strengths

1. Clean plugin structure — one Elysia plugin per domain resource; easy to navigate.
2. No hard deletes — archive/unarchive consistent across orgs, users, APIs, windows.
3. Dual-token auth — cookie + Bearer handled uniformly; idle-timeout + hard-max expiry.
4. Comprehensive access logging — every proxied request recorded with bytes, duration, IP, deny reason.
5. Audit trail — every management write emits audit log with action code, entity, JSON metadata.
6. Midnight-spanning window logic — previousDay rollover handled correctly in access.ts.
7. Schema/SQL migration largely in sync — FK constraints, composite unique keys, indexes present.
8. UTC-everywhere discipline — all timestamps stored as UTC strings via Luxon.
9. Bootstrap idempotency — waitForDb, ensureGlobalOrg, ensureBootstrapAdmin without duplication.
10. bcryptjs cost-10 hashing; password min-length 8 enforced in Elysia validation schema.

[Go to TOC](#table-of-contents)

---

## 3. Concrete Risks / Bugs

### CRITICAL

R1 — Missing ./db module (app crash at startup)
  Files: src/sessions.ts:3, src/access.ts:2
  Both import { query } from './db' but no src/db.ts or src/db/index.ts exists.
  sessions.ts and access.ts are called on every proxied request — module-not-found at startup.
  Fix: create src/db.ts exporting a query() wrapper over the mysql2 pool, OR
       migrate both files to use db.execute() from db/client.ts.

R2 — Fully-buffered proxy response with no size cap (OOM risk)
  File: src/proxy.ts ~lines 198-207
  All upstream response chunks collected into Buffer[] before forwarding to client.
  A 1 GB response is held entirely in heap.
  Fix: stream upstream body directly (pipe readable to response), or enforce PROXY_MAX_BODY_BYTES.

R3 — sql.raw with string-concatenated column names is SQLi-adjacent
  Files: src/routes/apis.ts PUT, src/routes/users.ts PUT, src/routes/orgs.ts PUT, src/routes/windows.ts PUT
  Column names come from hardcoded push() strings today (no current injection path).
  But the pattern is fragile — any refactor moving user input closer to column names introduces SQLi.
  Fix: use Drizzle typed .update().set() builder instead of raw string concatenation.

### HIGH

R4 — requireRole middleware exported but never used
  File: src/middleware/requireRole.ts
  All RBAC is inline if (authUser.role === ...) scattered across handlers.
  No enforcement guarantee; new handlers can silently omit role gating.
  Fix: adopt requireRole consistently, or use Elysia .guard for role gating.

R5 — authenticatePlugin does NOT abort the request on auth failure
  File: src/middleware/authenticate.ts
  On 401/403 the plugin sets set.status + returns null context; Elysia continues to the handler.
  Every handler must manually check if (!authUser). Any that omits it will null-dereference on authUser.role => 500.
  Fix: call error() or throw inside derive to short-circuit; or use .guard.

R6 — User enumeration via distinct error codes at login
  File: src/routes/auth.ts
  Returns USER_ARCHIVED (403) vs INVALID_CREDENTIALS (401) — reveals whether a username is archived.
  Fix: always return INVALID_CREDENTIALS; log real reason server-side only.

R7 — No RBAC on org and window write endpoints
  Files: src/routes/orgs.ts (POST/PUT/archive), src/routes/windows.ts (POST/PUT/archive)
  Any authenticated user (role=user) can create or archive organizations and access windows.
  Fix: add requireRole(['global_admin']) or requireRole(['global_admin','org_admin']) guards.

R8 — base_path='/' can shadow management routes
  File: src/access.ts getMatchingApi()
  An API registered with base_path='/' matches every path via the LIKE '/%' condition.
  If such an API is created, /healthz, /docs, etc., could be proxied instead of served.

### MEDIUM

R9 — Dead jsonwebtoken dependency with CVE history
  File: src/auth.ts — signToken/verifyToken exported but never called in production code.
  Fix: delete unused exports; remove jsonwebtoken from package.json.

R10 — Hardcoded bootstrap admin password default
  File: src/config.ts line ~77
  bootstrapPassword defaults to '010203!@' if env var absent.
  Fix: require BOOTSTRAP_ADMIN_PASSWORD; throw at startup if bootstrapAdmin=true and it is unset.

R11 — logAccess throws if deny reason code is unknown => 500 instead of clean error
  File: src/logging.ts getDenyReasonId(), getAuditActionId(), getAuditEntityId()
  All three throw if the lookup row is missing in the DB.
  Fix: use INSERT IGNORE / upsert for lookup rows, or gracefully handle missing codes.

R12 — sessions.id type mismatch: BIGINT in SQL vs int() in Drizzle schema
  SQL: 0000_initial_schema.sql line 104 — BIGINT AUTO_INCREMENT
  Schema: src/db/schema.ts line 43 — int('id').autoincrement()
  Future drizzle-kit generate will emit wrong DDL.

R13 — access_logs.path length mismatch: VARCHAR(1000) in schema vs VARCHAR(500) in migration
  Schema: src/db/schema.ts line ~116
  Migration: 0000_initial_schema.sql line ~82
  Paths over 500 chars are silently truncated in the actual DB.

R14 — session_token_hash type mismatch: CHAR(64) in SQL vs VARCHAR(64) in schema (minor)
  Future drizzle-kit migrations will diverge.

R15 — No request body size limit on proxy
  File: src/proxy.ts — request.arrayBuffer() with no size check.
  Clients can POST arbitrarily large bodies, fully buffered in memory.

R16 — X-Forwarded-For trusted unconditionally
  File: src/proxy.ts getClientIp()
  Safe behind Caddy, but a risk if backend is ever directly exposed.

[Go to TOC](#table-of-contents)

---

## 4. Missing Tests and Documentation

- Zero test files anywhere in backend/.
- Critical untested paths: session expiry/revocation, midnight-spanning window logic,
  proxy auth matrix (public/private/always-on combos), org mismatch rejection.
- No OpenAPI response schemas — all route responses are untyped; /openapi.json not useful for client generation.
- No routes tagged with security: [{bearerAuth: []}] despite scheme being declared.
- No README for backend — no env var docs, DB setup, TLS, or migration instructions.
- requireRole is undocumented and unused — misleads future contributors.
- No CHANGELOG despite version 0.2.0.

[Go to TOC](#table-of-contents)

---

## 5. Top-Priority Recommendations

| # | Priority | Action |
|---|---|---|
| 1 | CRITICAL | Resolve missing ./db module — create src/db.ts or migrate sessions.ts + access.ts to db/client.ts |
| 2 | CRITICAL | Cap proxy buffering — stream upstream response; add PROXY_MAX_BODY_BYTES guard |
| 3 | HIGH | Short-circuit auth failures in authenticatePlugin via error() or .guard |
| 4 | HIGH | Add RBAC guards to /orgs and /windows write endpoints; adopt requireRole consistently |
| 5 | HIGH | Remove dead JWT code; drop jsonwebtoken from package.json |
| 6 | MEDIUM | Fix schema vs migration mismatches: sessions.id BIGINT, access_logs.path length, session_token_hash type |
| 7 | MEDIUM | Require BOOTSTRAP_ADMIN_PASSWORD env var at startup; no hardcoded default |
| 8 | MEDIUM | Add OpenAPI response schemas using Elysia t.Object response typing |
| 9 | MEDIUM | Add integration tests: login, session expiry, proxy matrix, archive/restore |
| 10 | MEDIUM | Normalize login errors to prevent user enumeration |

[Go to TOC](#table-of-contents)

---

## Footer

This page is licensed under the
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).
