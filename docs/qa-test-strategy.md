# QA & Test Strategy — apiManager
> Generated: 2026-03-26 | Read-only review, no files modified.

---

## 0. Baseline: Current Test Coverage

**Zero automated tests exist.** No test runner, no test files, no `*.test.ts`, no `*.spec.ts` anywhere in the repo. This is the single largest QA risk. Every merge is currently validated only by manual inspection and linting.

---

## 1. High-Risk Workflows (priority-ordered)

### P0 — Proxy Authorization Engine (`src/proxy.ts`, `src/access.ts`)
The most critical code path. Incorrectly granting proxy access = security breach.

| Risk | Source |
|---|---|
| `isWithinWindows` midnight-crossing logic (startMinutes > endMinutes branch) | `access.ts:55-65` |
| No windows configured → returns `false` (deny) — intentional, but surprising | `access.ts:38-40` |
| `getMatchingApi` SQL `LIKE CONCAT(base_path, '/%')` — shortest path wins if ORDER BY LENGTH DESC fails | `access.ts:72-80` |
| `global_admin` bypasses window and permission checks entirely | `proxy.ts:89` |
| `org_admin` role is NOT a proxy bypass — relies on `isAssigned` | `proxy.ts:91-106` |
| HTML `Accept` header triggers 302 redirect instead of 401 JSON | `proxy.ts:127-132` |
| Upstream `fetch` errors return 502 but still log access — log integrity depends on DB | `proxy.ts:189-202` |
| `x-forwarded-for` header is trusted as-is for client IP — spoofable | `proxy.ts:20-24` |

### P0 — Session Lifecycle (`src/sessions.ts`, `src/middleware/authenticate.ts`)

| Risk | Source |
|---|---|
| `isSessionExpired`: `revoked_at_utc` stored in DB as raw string; comparison done by Luxon `fromSQL` — timezone assumption baked in | `sessions.ts:67-75` |
| `touchSession` called BEFORE expiry check in `authenticate.ts` — no, actually after — verify order carefully | `authenticate.ts:52-57` |
| Token is SHA-256 hash of 256-bit random — strong, but never rotated after use | `sessions.ts:14-17` |
| Cookie set `SameSite=None; Secure` — will not work without HTTPS; dev environment may silently fail | `authenticate.ts:62-67` |
| Logout does NOT revoke Bearer token (only cookie cleared) | `auth.ts:logout` |

### P1 — RBAC / Org Isolation (`src/routes/users.ts`, `src/routes/apis.ts`, `src/routes/permissions.ts`)

| Risk | Source |
|---|---|
| `org_admin` creating users: `targetOrganizationId` falls back to `authUser.organizationId` but body `organizationId` check only fires if `body.organizationId !== authUser.organizationId` — off-by-one trust | `users.ts:48-52` |
| `permissions/unassign` has NO org check — any authenticated user can unassign any permission | `permissions.ts:40-52` |
| `apis.put /:id` org_admin check only guards `body.organizationId`; no check that the target API belongs to their org | `apis.ts:67-70` |
| `users.put /:id` body `organizationId` guard checks `!== undefined` but the actual SQL only runs `if (body.organizationId)` — falsy 0 skipped | `users.ts:92,104` |

### P1 — Access Window Validation (`src/routes/windows.ts`, `src/utils/time.ts`)

| Risk | Source |
|---|---|
| `window.post` inserts but uses `ORDER BY id DESC LIMIT 1` to retrieve created ID — race condition with concurrent inserts | `windows.ts:43-47` |
| No validation that `startTime < endTime` when creating/updating (only format validated) | `windows.ts:8-16` |
| No authorization check: any org user can create windows for ANY `subjectId` (user/api outside their org) | `windows.ts:POST` |
| `parseTimeToMinutes` rounds seconds ≥30 up — not documented, subtle | `access.ts:33-36` |

### P1 — Reports (`src/routes/reports.ts`)

| Risk | Source |
|---|---|
| `resolveRange`: `toRaw && !fromRaw` sets `start = end.startOf("day")` but uses REPORT_TZ — could return wrong day at midnight boundary | `reports.ts:50-53` |
| `start > end` checked AFTER partial assignment — if only `to` is given, `start` is recalculated then checked | `reports.ts:55-58` |
| `normalizeRow` casts BigInt (`COUNT(*)`) with `Number()` — safe up to 2^53, but silently wrong beyond | `reports.ts:64-80` |
| Raw SQL in `ORG_QUERY`/`USER_QUERY` uses `sql.raw()` with array params (not template) — verify mysql2 binding order | `reports.ts:89-120` |

### P2 — Audit & Access Logging (`src/logging.ts`)

| Risk | Source |
|---|---|
| `getDenyReasonId` / `getAuditActionId` / `getAuditEntityId` throw hard errors if the lookup row is missing — unhandled audit failure crashes the response | `logging.ts:40-57` |
| Access log INSERT is fire-and-forget within route handlers — if DB is down, the request fails mid-flight with no user-facing message | `logging.ts:3-22` |
| `logAudit` called AFTER the data mutation succeeds — audit gap on concurrent failures | multiple routes |

### P2 — Timestamp / Timezone Correctness

| Risk | Source |
|---|---|
| DB stores UTC; `REPORT_TZ = "Africa/Johannesburg"` (SAST = UTC+2, no DST) — but `parseDate` uses Luxon `fromISO` in REPORT_TZ then `toUTC()` for SQL | `reports.ts:22,toUtcSql` |
| `getNowSast()` in `access.ts` and window evaluation uses wall-clock in SAST — server time zone drift would silently widen/shrink access windows | `access.ts:30` |
| `isSessionExpired` compares `DateTime.utc()` vs `fromSQL(last_activity_utc, {zone: "utc"})` — assumes DB string is UTC. Any manual DB edit in local time would grant extra idle time | `sessions.ts:67-75` |

---

## 2. Test Plan

### Layer 1 — Unit Tests (no DB, pure logic)

**Target:** `src/utils/time.ts`, `src/utils/datetime.ts`, `src/sessions.ts` (expiry function), `src/access.ts` (window math), `src/routes/reports.ts` (range helpers)

| Test ID | File | What to test |
|---|---|---|
| U-01 | `time.ts` | `isValidTime`: valid, invalid hour/minute/second, missing parts |
| U-02 | `time.ts` | `isFiveMinuteIncrement`: 0, 5, 10, 59, 61, NaN |
| U-03 | `datetime.ts` | `nowUtc` returns `yyyy-LL-dd HH:mm:ss` format |
| U-04 | `datetime.ts` | `toUtcSql` converts SAST DateTime to UTC SQL string correctly |
| U-05 | `sessions.ts` | `isSessionExpired`: not expired, idle-expired, hard-expired, revoked |
| U-06 | `sessions.ts` | `generateSessionToken` returns 32-byte base64url string |
| U-07 | `access.ts` | `parseTimeToMinutes` (extracted): rounding at second=30 |
| U-08 | `access.ts` | `isWithinWindows` with mocked DB: window matches, no match, midnight-crossing, inactive window, no windows (returns false) |
| U-09 | `reports.ts` | `parseDate`: valid ISO date, valid datetime, invalid string, boundary=start vs end |
| U-10 | `reports.ts` | `resolveRange`: from+to, from only, to only, from>to error, no params (fallback used) |
| U-11 | `reports.ts` | `withTotals` aggregation: empty array, one row, multiple rows, BigInt coercion |
| U-12 | `middleware/authenticate.ts` | `normalizeRole`: null, undefined, `" Org Admin "`, `"org-admin"` |

### Layer 2 — Integration Tests (live DB in container)

**Target:** route handlers via Elysia `app.handle()` with a test MariaDB seeded from `seed.ts`

| Test ID | Route | Scenario |
|---|---|---|
| I-01 | `POST /auth/login` | valid credentials → 200 + cookie set |
| I-02 | `POST /auth/login` | wrong password → 401 |
| I-03 | `POST /auth/login` | archived user → 403 |
| I-04 | `GET /auth/me` | valid session → user object |
| I-05 | `GET /auth/me` | no cookie → 401 |
| I-06 | `POST /auth/logout` | valid session → revoked, cookie cleared |
| I-07 | `GET /apis` | global_admin sees all orgs; org_admin sees own; user sees assigned+public |
| I-08 | `POST /apis` | org_admin tries to create API in other org → 403 |
| I-09 | `PUT /apis/:id` | org_admin tries to move API to other org → 403 |
| I-10 | `POST /permissions/assign` | user and API in different orgs → 403 |
| I-11 | `POST /permissions/unassign` | user in different org → should be 403 (currently **no check** — this is a bug test) |
| I-12 | `POST /users` | org_admin creates global_admin role → 403 |
| I-13 | `POST /users/:id/archive` | org_admin archives user in other org → 403 |
| I-14 | `POST /windows` | user creates window for API in other org → should be 403 (currently **no check**) |
| I-15 | `GET /reports/orgs/weekly` | valid range → correct totals; `from > to` → 400 |
| I-16 | `GET /reports/users/weekly` | org_admin sees own org only; global_admin sees all |

### Layer 3 — Proxy Authorization Matrix

These are critical enough to warrant a dedicated test suite against `handleProxy` with mocked DB responses.

| Test ID | Scenario | Expected |
|---|---|---|
| P-01 | Disabled API (`is_enabled=0`) | 403 API_DISABLED |
| P-02 | Public API, no auth | 200 (proxied) |
| P-03 | Public API, outside window | 403 API_OUTSIDE_ALLOWED_HOURS |
| P-04 | Private API, no auth, HTML Accept | 302 to /login |
| P-05 | Private API, no auth, JSON Accept | 401 AUTH_REQUIRED |
| P-06 | Private API, expired idle session | 401 SESSION_EXPIRED, cookie cleared |
| P-07 | Private API, hard-expired session | 401 SESSION_EXPIRED |
| P-08 | Private API, valid session, user not assigned | 403 USER_NOT_ASSIGNED_TO_API |
| P-09 | Private API, valid session, user in different org | 403 USER_ORG_MISMATCH |
| P-10 | Private API, user outside user window | 403 USER_OUTSIDE_ALLOWED_HOURS |
| P-11 | global_admin, all checks bypassed | 200 (proxied) |
| P-12 | `always_on=1` API, outside window | 200 (window skipped) |
| P-13 | API path not found | 404 API_NOT_FOUND |
| P-14 | Upstream 502 | 502 + access log recorded |
| P-15 | Window: midnight-crossing (e.g. 23:00–01:00), in range | 200 |
| P-16 | Window: midnight-crossing, out of range | 403 |

### Layer 4 — E2E (Playwright, optional / Phase 2)

Low priority until integration suite is green. Smoke tests only:
- Login → dashboard redirect
- Create API → appears in list
- Archive user → user is inactive
- Report page loads with data

---

## 3. Definition of Done

A release is ready when:

- [ ] All unit tests pass (`bun test` from `backend/`)
- [ ] All integration tests pass against a fresh seeded DB
- [ ] All proxy authorization matrix cases pass
- [ ] `npm run lint` passes with zero warnings in both `backend/` and `frontend/`
- [ ] `npm run build` (frontend) succeeds with zero TypeScript errors
- [ ] No `any` types introduced at route boundaries without justification
- [ ] All new endpoints covered by at least one happy-path integration test
- [ ] UTC timestamps verified for any new time-related code
- [ ] `AGENTS.md` updated if new test commands are added

---

## 4. Release Checklist

```
[ ] Run: npm run lint (backend)
[ ] Run: npm run lint (frontend)
[ ] Run: bun test (backend) — once tests exist
[ ] Verify seed.ts still runs clean on fresh schema
[ ] Verify DB migration applies cleanly (drizzle-kit migrate)
[ ] Check /openapi.json for any undocumented new fields
[ ] Confirm all timestamps in DB are UTC (spot-check access_logs)
[ ] Confirm frontend date inputs render yyyy-mm-dd (not locale-dependent)
[ ] Smoke-test login → me → logout via /docs Swagger UI
[ ] Confirm archived user cannot proxy-authenticate
[ ] Confirm uninstall.sh --purge does not affect running services
```

---

## 5. Tooling Decision

**Question:** What test runner to use for the backend (Bun + Elysia + TypeScript)?

| Option | Pros | Cons | Recommended? |
|---|---|---|---|
| **Bun built-in (`bun:test`)** | Zero config, native TypeScript, fastest, already in AGENTS.md as preferred runtime | Smaller ecosystem, fewer mocking utilities | ✅ **Recommended first** |
| Vitest | Rich mocking (vi.mock), watch mode, compatible with bun via `--reporter` | Adds a dependency, slightly slower startup | Good second choice |
| Jest | Mature, widely known | Requires ts-jest or babel, slow, heavy | Not recommended |
| Playwright (E2E only) | First-class E2E, headless/headed, trace viewer | Overkill for unit/integration; needs running containers | Phase 2 only |

**Recommendation:** Start with `bun:test` (no extra deps) + a single `vitest.config.ts` (or `bunfig.toml`) if mocking complexity grows. Add `@testing-library/react` for frontend component tests in a future sprint.

**Config to add to `backend/package.json`:**
```json
"scripts": {
  "test": "bun test",
  "test:watch": "bun test --watch",
  "test:coverage": "bun test --coverage"
}
```

---

## 6. Observability / Verification Gaps

| Gap | Impact | Fix |
|---|---|---|
| No structured logging to stdout — only DB audit logs | Ops cannot tail failures in real-time | Add `console.info` for proxy deny decisions with reason code |
| `getDenyReasonId` throws if unknown code — silently crashes log INSERT | Access log is lost, request may return 500 | Add `INSERT IGNORE` or pre-load deny reason IDs at startup |
| No health check endpoint documents DB connectivity | Quadlet health check is TCP only | Add `GET /health` that pings DB |
| Session `touchSession` is fire-and-forget — DB write failure is silent | Session appears active but activity not tracked | Await and log errors |
| No request ID / correlation ID in proxy or admin API | Cannot correlate access log with upstream trace | Add `X-Request-Id` header on ingress |
| Report BigInt overflow | Silent wrong totals above 9PB | Validate or use BigInt throughout |

---

## 7. Known Bugs Found During Review

| ID | Severity | Location | Description |
|---|---|---|---|
| BUG-01 | High | `permissions.ts:40` | `/permissions/unassign` has no org isolation — any authenticated user can unassign |
| BUG-02 | High | `routes/windows.ts:POST` | No org/ownership check on window creation — any user can create windows for any subject |
| BUG-03 | Medium | `routes/apis.ts:PUT/:id` | org_admin PATCH does not verify the target API belongs to their org before updating |
| BUG-04 | Medium | `routes/users.ts:104` | `if (body.organizationId)` — falsy 0 silently skipped; should be `!== undefined` |
| BUG-05 | Low | `proxy.ts:logout` | Bearer-token logout does not revoke the token in DB, only clears cookie |
| BUG-06 | Low | `windows.ts:43` | Race condition retrieving last inserted window ID via `ORDER BY id DESC` |
| BUG-07 | Low | `access.ts:33` | `parseTimeToMinutes` second-rounding not documented; inconsistent with DB `time` type precision |
