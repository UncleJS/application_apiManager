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
   - Frontend: `https://localhost:55000`
   - Backend (API + proxy): `https://localhost:55001`
   - phpMyAdmin: `https://localhost:55002`

Notes:
- Host helper scripts require Python 3 (`python3` or `python`) for env normalization.
- Public endpoints are served over HTTPS with a Caddy internal certificate; your browser will show a warning.
- The frontend uses the same-origin `https://localhost:55000/api/*` proxy for browser API calls. Visit `https://localhost:55001` only when you need direct backend access (for example `/docs` or `/healthz`).
- `https://localhost:55001/healthz` returns a simple health response.
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
- Backend (HTTPS `/healthz`)
- Frontend (HTTP root)

[Go to TOC](#table-of-contents)

## Seed data (dev/test)
`scripts/install.sh` reads seed flags from the root `.env` file.

Enable dev/test seed data on startup:
- Set `SEED_DATA=true` in `.env`, then run `scripts/install.sh`.

Enable access log seed generation (250k rows for 2025-01-01 to 2026-02-03):
- Set `SEED_DATA=true` and `SEED_ACCESS_LOGS=true` in `.env`, then run `scripts/install.sh`.
- This can take a few minutes; progress logs print every 10k rows.
- If access logs already exist, setup skips access log seeding.

[Go to TOC](#table-of-contents)

## Default admin (dev/test)
- Username: `global-admin`
- Password is taken from `BOOTSTRAP_ADMIN_PASSWORD` and must not be left at a placeholder value.

[Go to TOC](#table-of-contents)

## phpMyAdmin login
- URL: `https://localhost:55002`
- Login is required (no auto-login).
- Use the MariaDB credentials from `.env` (`MARIADB_USER` / `MARIADB_PASSWORD`).

[Go to TOC](#table-of-contents)

## Rebuild / remove
### install.sh vs rebuild.sh
- `scripts/install.sh` installs Quadlet units, copies the env file, builds images, starts services, waits for DB, runs migrations, and optionally seeds.
- `scripts/rebuild.sh` rebuilds backend and/or frontend images and restarts those services.
- Use `scripts/rebuild.sh` when you need code changes to take effect immediately.
- Neither script removes volumes or deletes data.

[Go to TOC](#table-of-contents)

- Rebuild containers: `scripts/rebuild.sh`
- Stop services: `scripts/stop.sh`
- Remove containers (keep volumes): `scripts/uninstall.sh`
- Remove containers + volumes: `scripts/uninstall.sh --purge`
- Only removes volumes not in use and only used by `api-manager-pod`.
- If compose labels are missing, it only removes volumes whose names start with `infra_api-manager-` or `api-manager-`.

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
- `CORS_ORIGIN` (default `https://localhost:55000`)
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
- `NEXT_PUBLIC_API_URL` (default `https://localhost:55001`)

[Go to TOC](#table-of-contents)

## Ports
- Frontend: `55000`
- Backend HTTPS: `55001`
- phpMyAdmin: `55002`
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
- Request: `https://localhost:55001/acme/orders/123?status=open`
- Upstream: `https://example.com/acme/orders/123?status=open`

Example 2 (different upstream root):
- `base_path`: `/globex/billing`
- `target_url`: `https://api.globex.com/v2`
- Request: `https://localhost:55001/globex/billing/invoices/55`
- Upstream: `https://api.globex.com/v2/invoices/55`

Example 3 (public API, no auth):
```bash
curl -k https://localhost:55001/global/public/ping
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
- TLS cert/key are generated on first backend start and stored in the `api-manager-tls` volume.

[Go to TOC](#table-of-contents)

## Footer
This page is licensed under the
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).
