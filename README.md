# API Manager

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)](LICENSE.md)
[![Bun](https://img.shields.io/badge/Bun-runtime-000000?logo=bun&logoColor=white)](backend/package.json)
[![Elysia](https://img.shields.io/badge/Elysia-backend-f472b6)](backend/package.json)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white)](frontend/package.json)
[![MariaDB](https://img.shields.io/badge/MariaDB-11.4-003545?logo=mariadb&logoColor=white)](.quadlet/api-manager-mariadb.container)
[![Podman Quadlet](https://img.shields.io/badge/Podman-Quadlet-892CA0?logo=podman&logoColor=white)](.quadlet/)

API gateway and admin console for managing proxied APIs with org-level access control, session auth, and usage reporting.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Repository Structure](#repository-structure)
- [Requirements](#requirements)
- [Quickstart](#quickstart)
- [Scripts](#scripts)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Ports](#ports)
- [Authentication](#authentication)
- [Seeded dev/test users](#seeded-devtest-users)
- [Documentation](#documentation)
- [Current Gaps](#current-gaps)

## Overview
This project includes:
- A backend reverse proxy and admin API (`backend/`) built with **Bun + Elysia + Drizzle ORM** (TypeScript).
- A **Next.js 14 App Router** admin UI (`frontend/`) with Tailwind high-contrast dark theme for orgs, users, APIs, permissions, windows, reports, and active sessions.
- Rootless **Podman + systemd Quadlet** infrastructure (`.quadlet/`) with MariaDB, backend, frontend, optional phpMyAdmin, and Caddy for HTTPS edge serving.
- Caddy owns the public HTTPS ports; the backend runs on an internal-only HTTP port inside the pod.
- OpenAPI spec at `/openapi.json` and Swagger UI at `/docs` when `DOCS_ENABLED=true`.

[↑ Back to TOC](#table-of-contents)

## Key Features
- Longest-prefix reverse proxy routing from `base_path` to `target_url`.
- API `base_path` values are globally unique across all organisations.
- Role-based access control (`global_admin`, `org_admin`, `user`).
- DB-backed sessions with cookie `api_manager_session` and bearer token support using the same session token.
- Time-window access constraints for APIs and users.
- Access and audit logging with report endpoints.
- Archive/unarchive workflow (no delete endpoints).

[↑ Back to TOC](#table-of-contents)

## Repository Structure
- `backend/`: Bun + Elysia + Drizzle ORM API/proxy
- `frontend/`: Next.js 14 App Router admin UI
- `.quadlet/`: Podman Quadlet pod/volume/container units (systemd user services)
- `infra/`: Caddyfile templates (seeded into the Caddy config volume by `install.sh`) and DB reference SQL
- `scripts/`: install/build/start/stop/restart/rebuild/uninstall/dev/logs/seed helpers; shared names and ports live in `scripts/common.sh`
- `docs/`: operations and plan guides
- `Containerfile.dev`: Bun dev container (`oven/bun:1.2.15`)

[↑ Back to TOC](#table-of-contents)

## Requirements
- Podman (rootless) + `systemd --user` (RHEL 10 / Fedora recommended)
- Python 3 available as `python3` or `python` for helper-script env normalization
- Project runtimes run in containers; host commands are limited to Podman/systemd helper scripts.

[↑ Back to TOC](#table-of-contents)

## Quickstart
1. Copy env template:
```bash
cp .env.example .env
# edit .env — set MARIADB_* and review generated/bootstrap values
```
2. Install runtime Quadlet units, create volumes, seed Caddy config, enable linger, start pod:
```bash
scripts/install.sh
```
   For the separate dev container workflow, run `scripts/dev.sh`.
   
3. Open:
   - Frontend: `https://localhost:1100`
   - Backend API: `https://localhost:1101` (Swagger at `/docs` when `DOCS_ENABLED=true`)
   - phpMyAdmin: `https://localhost:1102` only after `scripts/install.sh --enable-phpmyadmin`

Notes:
- Certificates are self-signed; browser warnings are expected.
- Frontend requests use the same-origin `/api/*` proxy on `https://localhost:1100`; direct `1101` trust is only needed when you open backend docs or API routes yourself.
- After code changes, use `scripts/rebuild.sh` to rebuild images and restart.
- `scripts/install.sh` does not install the dev Quadlet; use `scripts/dev.sh` for local development.
- To stop: `scripts/stop.sh`
- To remove: `scripts/uninstall.sh` (see [Scripts](#scripts) below).

[↑ Back to TOC](#table-of-contents)

## Scripts
All lifecycle and helper scripts live in `scripts/`. They drive `podman` and `systemctl --user`; `install.sh` and `dev.sh` also use host `python3` to normalise `.env`. Details, options and examples are in [scripts/README.md](scripts/README.md). Shared names and ports live in `scripts/common.sh`.

| Script | Purpose |
|--------|---------|
| `scripts/install.sh` | Check prerequisites, normalise `.env`, build images, copy Quadlet units to `~/.config/containers/systemd/`, start the pod, migrate and optionally seed. Options: `--enable-linger`, `--no-linger`, `--enable-phpmyadmin` |
| `scripts/build.sh` | Build or rebuild the backend and frontend images |
| `scripts/start.sh` | Start the pod and services, then print the URLs |
| `scripts/stop.sh` | Stop the pod and services |
| `scripts/restart.sh` | Stop, then start |
| `scripts/rebuild.sh [backend\|frontend]` | Rebuild images and restart those services |
| `scripts/uninstall.sh` | Remove services, containers, pod, repo-built images and build layers, unused base images and leftover state. Keeps volumes and Quadlet units unless `--purge` (asks you to type `YES` unless `JOB` is set) or `--remove-quadlets` is given. It ends with a leftover check and exits non-zero if anything that should be gone remains; with both flags nothing from the install is left. `JOB=<slug> PORT_OFFSET=<n>` targets a parallel job install |
| `scripts/dev.sh` | Build the dev container image and restart the dev unit |
| `scripts/logs.sh [service]` | Follow service logs |
| `scripts/seed.sh` | Run the one-shot seed |
| `scripts/common.sh` | Shared names and ports, sourced by the other scripts (not run directly) |

[↑ Back to TOC](#table-of-contents)

## Local Development
All project runtimes run inside the dev container. Build/start it with:
```bash
scripts/dev.sh
```

Then run commands inside the container:
```bash
# Backend
podman exec -it api-manager-dev sh -lc 'cd /workspace/backend && bun run dev'

# Frontend
podman exec -it api-manager-dev sh -lc 'cd /workspace/frontend && bun run dev'
```

Common commands (run inside container):
- Backend build: `bun run build` (from `backend/`)
- Backend lint: `bun run lint` (from `backend/`)
- Frontend build: `bun run build` (from `frontend/`)
- Frontend lint: `bun run lint` (from `frontend/`)
- Seed DB: `bun run seed` (from `backend/`)

[↑ Back to TOC](#table-of-contents)

## Environment Variables
Set env in root `.env` (see `.env.example`).

Important values:
- `MARIADB_DATABASE`, `MARIADB_USER`, `MARIADB_PASSWORD`, `DB_ROOT_PASSWORD` — database credentials.
- `BOOTSTRAP_ADMIN_PASSWORD` — required non-default bootstrap admin password; helper scripts now auto-generate one if the file still uses a placeholder.
- `NEXT_PUBLIC_API_URL=https://localhost:1101`
- `CORS_ORIGIN=https://localhost:1100`
- `SESSION_IDLE_SECONDS`, `SESSION_HARD_MAX_SECONDS`
- `SEED_DATA`, `SEED_ACCESS_LOGS`

[↑ Back to TOC](#table-of-contents)

## Ports
Registered range: `1100-1109` (`PORT_RANGE` in `scripts/common.sh`).
- `1100` frontend (via Caddy HTTPS)
- `1101` backend HTTPS (Elysia + Caddy)
- `1102` phpMyAdmin (via Caddy HTTPS, opt-in)
- Pod-internal only (never published): frontend 3000, backend 3001, MariaDB 3306

If you moved from an older install, update bookmarks, API clients, upstream callers and any `CORS_ORIGIN` / `NEXT_PUBLIC_API_URL` overrides to the ports above. A second copy can run beside the main install with `JOB=<slug> PORT_OFFSET=<n>` (every published port becomes its base port + `PORT_OFFSET`) (see [scripts/README.md](scripts/README.md#shared-names-and-ports-commonsh)).

[↑ Back to TOC](#table-of-contents)

## Authentication
- Browser/admin sessions: secure HTTP-only cookie `api_manager_session`.
- API clients: `POST /auth/login` with username/password. The response returns `{ ok: true }` and sets the `api_manager_session` cookie.
- For non-browser clients, the session token can be taken from the `Set-Cookie` header and replayed as either the `api_manager_session` cookie or `Authorization: Bearer <token>`.
- Seeded/default passwords must be set to non-placeholder values before use.
- Public HTTPS is terminated by Caddy; the backend itself is internal HTTP-only inside the pod.

[↑ Back to TOC](#table-of-contents)

## Seeded dev/test users
When `SEED_DATA=true`, the seed script creates these users:
- `global-admin`
- `acme-admin`
- `acme-user`
- `globex-admin`
- `globex-user`

All seeded users share one password from `SEED_USER_PASSWORD`, or `BOOTSTRAP_ADMIN_PASSWORD` when the seed password is unset. Known defaults are refused. The production image ignores seed flags on the long-running process. `scripts/install.sh` and `scripts/seed.sh` pass `ALLOW_SEED=true` only for the one-shot seed.

When you run `scripts/install.sh` with `SEED_DATA=true`, the script auto-generates `SEED_USER_PASSWORD` in `.env` if it is blank or still set to a placeholder value.

[↑ Back to TOC](#table-of-contents)

## Documentation
- [Operations guide](docs/operations.md)
- [Scripts reference](scripts/README.md)
- [QA and test strategy](docs/qa-test-strategy.md)
- [Agent instructions](AGENTS.md)

[↑ Back to TOC](#table-of-contents)

## Current Gaps
- Containerized stack validation depends on a valid local `.env`; helper scripts now normalize required aliases, but a real non-placeholder database/root password policy is still recommended.

[↑ Back to TOC](#table-of-contents)

---

© 2026 API Manager contributors — Licensed under [CC BY-NC-SA 4.0](LICENSE.md)
