# API Manager Plan

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
![Backend](https://img.shields.io/badge/backend-Fastify%20%2B%20TypeScript-009688)
![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-61DAFB)

## Table of Contents
- [Goals](#goals)
- [Ports](#ports)
- [Architecture](#architecture)
- [Database schema (UTC timestamps, no enums)](#database-schema-utc-timestamps-no-enums)
- [Access control rules](#access-control-rules)
- [Admin API endpoints](#admin-api-endpoints)
- [Reporting](#reporting)
- [Frontend (React + Vite)](#frontend-react--vite)
- [Podman Compose (single pod)](#podman-compose-single-pod)
- [Seed data (dev/test only)](#seed-data-devtest-only)
- [Bootstrap](#bootstrap)
- [Scripts](#scripts)
- [Implementation sequence](#implementation-sequence)
- [Footer](#footer)

## Goals
- Reverse proxy with self-signed HTTPS.
- Log user access and request/response volume to MariaDB.
- Restrict users to assigned APIs and time windows (multiple daily windows).
- APIs have time windows or "always on".
- React admin UI for orgs, users, APIs, assignments, and reports.
- Containerized with Podman Compose in a single pod on RHEL10.

[Go to TOC](#table-of-contents)

## Ports
- Frontend: `55000`
- Backend HTTPS: `55001`
- phpMyAdmin: `55002`
- MariaDB: internal only (no host port)

[Go to TOC](#table-of-contents)

## Architecture
- Backend: Node.js + TypeScript + Fastify (reverse proxy + admin API + auth + logging).
- Database: MariaDB.
- Frontend: React + Vite.
- Podman: single pod with backend, frontend, mariadb, phpMyAdmin.
- TLS: self-signed certs generated on first boot and persisted to volume.

[Go to TOC](#table-of-contents)

## Database schema (UTC timestamps, no enums)
### Lookup tables
- roles (`global_admin`, `org_admin`, `user`)
- user_statuses (`active`, `archived`)
- organization_statuses (`active`, `archived`)
- deny_reasons (`code`, `message`)
- audit_actions (for example `USER_CREATE`, `API_ARCHIVE`)
- audit_entities (`user`, `org`, `api`, `permission`, `window`)

### Core tables
- organizations: id, name, status_id FK, created_at_utc, updated_at_utc
- Includes explicit "Global" org row.
- users: id, username, password_hash, organization_id FK, role_id FK, status_id FK, created_at_utc, updated_at_utc
- api_definitions: id, organization_id FK (use Global for org-less), name, base_path, target_url, is_public bool, is_enabled bool, always_on bool, created_at_utc, updated_at_utc
- user_api_permissions: id, user_id FK, api_id FK, created_at_utc
- access_windows: id, subject_type (`user|api`), subject_id, day_of_week (1-7, 1=Mon), start_time, end_time, is_active, created_at_utc
- access_logs: id, organization_id FK, user_id nullable FK, api_id FK, method, path, status, request_bytes, response_bytes, duration_ms, client_ip, deny_reason_id FK, created_at_utc
- audit_logs: id, organization_id FK, user_id FK, action_id FK, entity_id FK, metadata_json, created_at_utc

Notes:
- `access_windows.subject_type` is stored as a string and validated in the app.
- Windows crossing midnight are supported.

[Go to TOC](#table-of-contents)

## Access control rules
- API match by longest prefix on `base_path`.
- API must be enabled.
- If `always_on`, skip API windows; else must match at least one API window.
- Public APIs require no JWT but still enforce API windows.
- Restricted APIs require JWT.
- Org scope: users access APIs in their org unless `global_admin`.
- Org admins still require assignment.
- Global admins bypass assignment and all time windows.
- No windows rule: if no windows exist for user or API (and not `always_on`), deny.
- Denials return structured JSON with code/message/details and are logged.

[Go to TOC](#table-of-contents)

## Admin API endpoints
- `POST /auth/login`
- `GET/POST/PUT /orgs` + `POST /orgs/:id/archive` (global_admin only)
- `GET/POST/PUT /users` + `POST /users/:id/archive`
- `GET/POST/PUT /apis` + `POST /apis/:id/archive`
- `POST /permissions/assign`
- `POST /permissions/unassign`
- `GET/POST/PUT /windows`
- `POST /windows/:id/archive`
- Reports:
- `GET /reports/orgs/weekly`
- `GET /reports/orgs/monthly`
- `GET /reports/users/weekly`
- `GET /reports/users/monthly`

[Go to TOC](#table-of-contents)

## Reporting
- Weekly boundaries: Monday-Sunday (SAST).
- Return per-org or per-user rows and a totals row.
- Metrics per row:
- `allowed_count`, `denied_count`, `total_count`
- `request_bytes_allowed`, `response_bytes_allowed`, `total_bytes_allowed`
- `request_bytes_denied`, `response_bytes_denied`, `total_bytes_denied`
- `request_bytes_total`, `response_bytes_total`, `total_bytes_total`

[Go to TOC](#table-of-contents)

## Frontend (React + Vite)
- Login page.
- Organizations page (global_admin only).
- Users page (assign APIs, multi-window editor with 5-minute steps).
- APIs page (always_on toggle + multi-window editor).
- Reports page (weekly/monthly org/user).
- Hide time window controls for global_admin users.

[Go to TOC](#table-of-contents)

## Podman Compose (single pod)
- Pod: `api-manager-pod`
- frontend: `55000`
- backend HTTPS: `55001`
- phpMyAdmin: `55002`
- mariadb: internal only
- Volumes: DB data, TLS cert/key, JWT secret

[Go to TOC](#table-of-contents)

## Seed data (dev/test only)
- Seed orgs (including Global), users, APIs, windows, assignments.
- Default dev/test password: `001002..Ad`
- Controlled by env: `SEED_DATA=true`

### Access log seed generation
- Total rows: `250,000`
- Range: `2025-01-01` to `2026-02-03`
- Weighted traffic:
- Weekdays: 80%, weekends: 20%
- 60% between `09:00-17:00` SAST
- Denied ratio: 3% total
- Deny reason mix:
- 50% `USER_OUTSIDE_ALLOWED_HOURS`
- 25% `USER_NOT_ASSIGNED_TO_API`
- 15% `API_OUTSIDE_ALLOWED_HOURS`
- 10% `AUTH_REQUIRED`
- Bytes:
- Request: `200-4,000` (skewed small)
- Response: `500-50,000` (skewed)
- Denied responses: `100-2,000`
- Latency: `10-2,000 ms` (skewed)

[Go to TOC](#table-of-contents)

## Bootstrap
- Create Global org.
- Create default global_admin with password `001002..Ad`.
- Generate JWT secret.
- Generate TLS cert/key.

[Go to TOC](#table-of-contents)

## Scripts
- `scripts/setup.sh`: create pod, volumes, init DB, optional seed.
- `scripts/build.sh`: build backend/frontend images.
- `scripts/rebuild.sh`: stop/remove containers, rebuild, restart.
- `scripts/remove.sh`: stop pod; keep volumes by default, `--purge` deletes.

[Go to TOC](#table-of-contents)

## Implementation sequence
1. Scaffold folders and configs.
2. Backend setup + DB schema + seed scripts.
3. Access logic + proxy + logging.
4. Admin API endpoints.
5. Frontend UI.
6. Podman Compose pod.
7. Docs + AGENTS update.
8. Smoke tests.

[Go to TOC](#table-of-contents)

## Footer
This page is licensed under the
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).
