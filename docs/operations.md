# Operations Guide

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
![Runtime](https://img.shields.io/badge/runtime-Bun%20%2B%20Next.js-f59e0b)
![Infra](https://img.shields.io/badge/infra-Podman%20Quadlet-892CA0)

## Table of Contents
- [Quickstart (Podman Quadlet)](#quickstart-podman-quadlet)
- [Sessions](#sessions)
- [Health checks](#health-checks)
- [Seed data (dev/test)](#seed-data-devtest)
- [Default admin (dev/test)](#default-admin-devtest)
- [phpMyAdmin login](#phpmyadmin-login)
- [Rebuild / remove](#rebuild--remove)
- [Environment variables](#environment-variables)
- [Ports](#ports)
- [Reverse proxy usage](#reverse-proxy-usage)
- [Reports date range](#reports-date-range)
- [Access windows schema note](#access-windows-schema-note)
- [TLS](#tls)
- [Footer](#footer)

## Quickstart (Podman Quadlet)
1. Copy `.env.example` to `.env`.
2. Run `scripts/install.sh`.
3. After code changes, use `scripts/rebuild.sh`.
4. Open the UI:
   - Frontend: `https://localhost:1100`
   - Backend (API + proxy): `https://localhost:1101`
   - phpMyAdmin (only when enabled): `https://localhost:1102`

Notes:
- Host helper scripts require Python 3 (`python3` or `python`) for env normalization.
- `scripts/install.sh` installs only the runtime Quadlets; build/start the separate dev container with `scripts/dev.sh`.
- Public endpoints are served over HTTPS with a Caddy internal certificate; your browser will show a warning.
- The frontend uses the same-origin `https://localhost:1100/api/*` proxy for browser API calls. Visit `https://localhost:1101` only when you need direct backend access.
- `https://localhost:1101/healthz` is liveness. `https://localhost:1101/readyz` is readiness (database up). Swagger at `/docs` is served only when `DOCS_ENABLED=true`.
- MariaDB has no host port; it is only reachable inside the pod.

[Go to TOC](#table-of-contents)

## Sessions
- Browser sessions use an HTTP-only cookie (`api_manager_session`).
- API clients can reuse the same session token as either a cookie or `Authorization: Bearer <token>`.
- Idle timeout: 60 minutes. Hard max: 180 minutes.

API client usage:
- `POST /auth/login` with JSON `{ "username": "...", "password": "..." }`
- Response sets the auth cookie and returns `{ "ok": true }`
- The login JSON body does **not** include the session token.
- Non-browser clients that want bearer auth must extract the `api_manager_session` value from the `Set-Cookie` header, then send it as `Authorization: Bearer <token>`.

[Go to TOC](#table-of-contents)

## Health checks
Container healthchecks are configured in Quadlet container units for:
- MariaDB (ping)
- Backend (HTTP `/readyz` inside the pod)
- Frontend (HTTP root)
- Edge (Caddy process check)

[Go to TOC](#table-of-contents)

## Seed data (dev/test)
`scripts/install.sh` reads seed flags from the root `.env` file.

Enable dev/test seed data during install:
- Set `SEED_DATA=true` in `.env`, then run `scripts/install.sh`.
- Install runs seed once with `ALLOW_SEED=true`. The long-running production backend ignores `SEED_DATA` and `SEED_ACCESS_LOGS` unless that one-shot flag is set, so a leftover seed flag does not crash the API.
- Seeded users: `global-admin`, `acme-admin`, `acme-user`, `globex-admin`, `globex-user`.
- All seeded users share the same password from `SEED_USER_PASSWORD`.
- If `SEED_USER_PASSWORD` is blank or still `change_this_for_seeded_users`, `scripts/install.sh` auto-generates a non-placeholder value in `.env`.
- Manual seed refuses `NODE_ENV=production` unless `ALLOW_SEED=true`, and refuses known default passwords. `scripts/seed.sh` sets `ALLOW_SEED=true` for that one-shot run. Set `SEED_USER_PASSWORD` to a unique value. There is no built-in default password.

Enable access log seed generation (250k rows for 2025-01-01 to 2026-02-03):
- Set `SEED_DATA=true` and `SEED_ACCESS_LOGS=true` in `.env`, then run `scripts/install.sh`.
- This can take a few minutes; progress logs print every 10k rows.
- If access logs already exist, setup skips access log seeding.

[Go to TOC](#table-of-contents)

## Default admin (dev/test)
- Username: `global-admin`
- Without `SEED_DATA`, the bootstrap admin password comes from `BOOTSTRAP_ADMIN_PASSWORD` and must not be left at a placeholder value.
- With `SEED_DATA=true`, `global-admin` is also part of the seeded user set and uses the shared seeded-user password described above.
- Changing `BOOTSTRAP_ADMIN_PASSWORD` does not rotate an existing `global-admin` password. Change it through the users API, which revokes that user's sessions.

[Go to TOC](#table-of-contents)

## phpMyAdmin login
- Off by default. Enable with `ENABLE_PHPMYADMIN=true` in `.env` or `scripts/install.sh --enable-phpmyadmin`. The CLI flag is written back into `.env` so a later install keeps phpMyAdmin.
- URL when enabled: `https://localhost:1102`
- Login is required (no auto-login).
- Use the MariaDB credentials from `.env` (`MARIADB_USER` / `MARIADB_PASSWORD`).

[Go to TOC](#table-of-contents)

## Rebuild / remove
### install.sh vs rebuild.sh
- `scripts/install.sh` installs runtime Quadlet units, normalizes the repo-local `.env` in place, builds images, starts services, waits for DB, runs migrations, and optionally seeds.
- `scripts/dev.sh` installs/rebuilds only the dev Quadlet and restarts the dev container.
- `scripts/rebuild.sh` rebuilds backend and/or frontend images and restarts those services.
- Use `scripts/rebuild.sh` when you need code changes to take effect immediately.
- Neither script removes volumes or deletes data.

[Go to TOC](#table-of-contents)

- Rebuild containers: `scripts/rebuild.sh`
- Stop services: `scripts/stop.sh`
- Remove containers (keep volumes): `scripts/uninstall.sh`
- Remove containers + volumes: `scripts/uninstall.sh --purge`
- After you type `YES`, purge deletes the named volumes `api-manager-db`, `api-manager-tls`, `api-manager-jwt`, `api-manager-caddy-config`, `api-manager-caddy-data`, and `api-manager-dev`, including the `systemd-` prefixed copies when they exist.

[Go to TOC](#table-of-contents)

## Environment variables
Create a `.env` file at repo root (see `.env.example`).
Scripts load `.env` automatically, even when run from `scripts/`.

Backend:
- `PORT` (internal backend port; Quadlet sets `3001` for the deployed stack)
- `DB_HOST` (default `127.0.0.1`)
- `DB_PORT` (default `3306`)
- `DB_USER` (default `api_manager`)
- `DB_PASSWORD` (default `api_manager_password`)
- `DB_DATABASE` (default `api_manager`)
- `BOOTSTRAP_ADMIN` (default `true`)
- `BOOTSTRAP_ADMIN_PASSWORD` (must be non-default when bootstrap admin is enabled)
- `SEED_DATA` (default `false`)
- `SEED_ACCESS_LOGS` (default `false`)
- `CORS_ORIGIN` (default `https://localhost:1100`)
- `DB_WAIT_RETRIES` (default `60`)
- `DB_WAIT_DELAY_MS` (default `2000`)
- `SESSION_IDLE_SECONDS` (default `3600`)
- `SESSION_HARD_MAX_SECONDS` (default `10800`)
- `PROXY_MAX_REQUEST_BYTES`, `PROXY_MAX_RESPONSE_BYTES`

Setup script:
- `MARIADB_ROOT_PASSWORD` (required; used by MariaDB and by `scripts/install.sh` readiness checks)
- `DB_ROOT_PASSWORD` (compatibility alias present in `.env.example`)
- `DB_HOST` (default `127.0.0.1`)

Frontend:
- `NEXT_PUBLIC_API_URL` (the deployed frontend image calls `/api` through Caddy; set this only for local frontend dev, for example `https://localhost:1101`)

[Go to TOC](#table-of-contents)

## Ports
Registered range `1100-1109`; the numbers live in `scripts/common.sh`. They were `55000`-`55002` before.
- Frontend: `1100`
- Backend HTTPS: `1101`
- phpMyAdmin: `1102` (only when enabled)
- MariaDB: internal only

[Go to TOC](#table-of-contents)

## Reverse proxy usage
Requests to the backend HTTPS port are routed by longest-prefix match on `base_path`.
The suffix after `base_path` is appended to `target_url`.
Each configured `base_path` must be globally unique across all organisations.

Browser login flow:
- If a restricted API is accessed in a browser, the user is redirected to `/login`.
- After successful login, the user is redirected back to the original URL.

API client login flow:
- `POST /auth/login` returns `{ ok: true }` and sets the auth cookie.
- Bearer-token clients can still send `Authorization: Bearer <token>` when reusing an existing session token.

Example 1 (simple passthrough):
- `base_path`: `/acme/orders`
- `target_url`: `https://example.com/acme/orders`
- Request: `https://localhost:1101/acme/orders/123?status=open`
- Upstream: `https://example.com/acme/orders/123?status=open`

Example 2 (different upstream root):
- `base_path`: `/globex/billing`
- `target_url`: `https://api.globex.com/v2`
- Request: `https://localhost:1101/globex/billing/invoices/55`
- Upstream: `https://api.globex.com/v2/invoices/55`

Example 3 (public API, no auth):
```bash
curl -k https://localhost:1101/global/public/ping
```

Example 4 (restricted API):
- Browser clients use the auth cookie set by `/auth/login`.
- Bearer-token clients must use a valid session token taken from the `api_manager_session` cookie; the login JSON response does not include it.

Notes:
- The API must be enabled and within its allowed hours (unless global admin).
- Users can only access APIs in their org that are assigned to them.

[Go to TOC](#table-of-contents)

## Reports date range
All report endpoints accept optional `from` and `to` query params (ISO date or datetime).
- Example: `/reports/orgs/weekly?from=2025-01-01&to=2026-02-03`
- If omitted, the current week or month is used.
- The UI date picker fills `YYYY-MM-DD` and the text input keeps that format.

[Go to TOC](#table-of-contents)

## Access windows schema note
The `access_windows` table in the DB does not have foreign keys because it is polymorphic:
- `subject_type` is `user` or `api`
- `subject_id` points to either `users.id` or `api_definitions.id`

MariaDB cannot enforce a single FK across multiple tables, so validation is handled in the app.

[Go to TOC](#table-of-contents)

## TLS
- Public HTTPS is terminated by Caddy with `tls internal` (a local CA). The backend listens on plain HTTP inside the pod.
- The `api-manager-tls` and `api-manager-jwt` volumes are unused by the current units. They remain so existing purge scripts keep a stable volume list. Caddy certificates live in `api-manager-caddy-data`.

[Go to TOC](#table-of-contents)

## Footer
This page is licensed under the
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).
