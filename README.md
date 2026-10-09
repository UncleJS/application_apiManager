# API Manager

API gateway and admin console for managing proxied APIs with org-level access control, session auth, and usage reporting.

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
![Backend](https://img.shields.io/badge/backend-Bun%20%2B%20Elysia%20%2B%20Drizzle-f472b6)
![Frontend](https://img.shields.io/badge/frontend-Next.js%2014%20%2B%20Tailwind-61DAFB)
![Infra](https://img.shields.io/badge/infra-Podman%20Quadlet-892CA0)

## Table of Contents
- [API Manager](#api-manager)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Key Features](#key-features)
  - [Repository Structure](#repository-structure)
  - [Requirements](#requirements)
  - [Quickstart](#quickstart)
  - [Local Development](#local-development)
  - [Environment Variables](#environment-variables)
  - [Ports](#ports)
  - [Authentication](#authentication)
  - [Seeded dev/test users](#seeded-devtest-users)
  - [Documentation](#documentation)
  - [Current Gaps](#current-gaps)
  - [Footer](#footer)

## Overview
This project includes:
- A backend reverse proxy and admin API (`backend/`) built with **Bun + Elysia + Drizzle ORM** (TypeScript).
- A **Next.js 14 App Router** admin UI (`frontend/`) with Tailwind high-contrast dark theme for orgs, users, APIs, permissions, windows, reports, and active sessions.
- Rootless **Podman + systemd Quadlet** infrastructure (`.quadlet/`) with MariaDB, backend, frontend, optional phpMyAdmin, and Caddy for HTTPS edge serving.
- Caddy owns the public HTTPS ports; the backend runs on an internal-only HTTP port inside the pod.
- OpenAPI spec at `/openapi.json` and Swagger UI at `/docs` when `DOCS_ENABLED=true`.

[Go to TOC](#table-of-contents)

## Key Features
- Longest-prefix reverse proxy routing from `base_path` to `target_url`.
- API `base_path` values are globally unique across all organisations.
- Role-based access control (`global_admin`, `org_admin`, `user`).
- DB-backed sessions with cookie `api_manager_session` and bearer token support using the same session token.
- Time-window access constraints for APIs and users.
- Access and audit logging with report endpoints.
- Archive/unarchive workflow (no delete endpoints).

[Go to TOC](#table-of-contents)

## Repository Structure
- `backend/`: Bun + Elysia + Drizzle ORM API/proxy
- `frontend/`: Next.js 14 App Router admin UI
- `.quadlet/`: Podman Quadlet pod/volume/container units (systemd user services)
- `infra/`: DB reference SQL and Caddyfile template (reference only)
- `scripts/`: install/start/stop/rebuild/uninstall/dev/logs/seed helpers
- `docs/`: operations and plan guides
- `Containerfile.dev`: UBI10-minimal dev container with Bun

[Go to TOC](#table-of-contents)

## Requirements
- Podman (rootless) + `systemd --user` (RHEL 10 / Fedora recommended)
- Python 3 available as `python3` or `python` for helper-script env normalization
- Project runtimes run in containers; host commands are limited to Podman/systemd helper scripts.

[Go to TOC](#table-of-contents)

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
   - Frontend: `https://localhost:55000`
   - Backend API: `https://localhost:55001` (Swagger at `/docs` when `DOCS_ENABLED=true`)
   - phpMyAdmin: `https://localhost:55002` only after `scripts/install.sh --enable-phpmyadmin`

Notes:
- Certificates are self-signed; browser warnings are expected.
- Frontend requests use the same-origin `/api/*` proxy on `https://localhost:55000`; direct `55001` trust is only needed when you open backend docs or API routes yourself.
- After code changes, use `scripts/rebuild.sh` to rebuild images and restart.
- `scripts/install.sh` does not install the dev Quadlet; use `scripts/dev.sh` for local development.
- To stop: `scripts/stop.sh`
- To remove: `scripts/uninstall.sh` (`--purge` also removes volumes when safe).

[Go to TOC](#table-of-contents)

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

[Go to TOC](#table-of-contents)

## Environment Variables
Set env in root `.env` (see `.env.example`).

Important values:
- `MARIADB_DATABASE`, `MARIADB_USER`, `MARIADB_PASSWORD`, `DB_ROOT_PASSWORD` — database credentials.
- `BOOTSTRAP_ADMIN_PASSWORD` — required non-default bootstrap admin password; helper scripts now auto-generate one if the file still uses a placeholder.
- `NEXT_PUBLIC_API_URL=https://localhost:55001`
- `CORS_ORIGIN=https://localhost:55000`
- `SESSION_IDLE_SECONDS`, `SESSION_HARD_MAX_SECONDS`
- `SEED_DATA`, `SEED_ACCESS_LOGS`

[Go to TOC](#table-of-contents)

## Ports
- `55000` frontend (via Caddy HTTPS)
- `55001` backend HTTPS (Elysia + Caddy)
- `55002` phpMyAdmin (via Caddy HTTPS, opt-in)
- MariaDB is internal-only in the pod

[Go to TOC](#table-of-contents)

## Authentication
- Browser/admin sessions: secure HTTP-only cookie `api_manager_session`.
- API clients: `POST /auth/login` with username/password. The response returns `{ ok: true }` and sets the `api_manager_session` cookie.
- For non-browser clients, the session token can be taken from the `Set-Cookie` header and replayed as either the `api_manager_session` cookie or `Authorization: Bearer <token>`.
- Seeded/default passwords must be set to non-placeholder values before use.
- Public HTTPS is terminated by Caddy; the backend itself is internal HTTP-only inside the pod.

[Go to TOC](#table-of-contents)

## Seeded dev/test users
When `SEED_DATA=true`, the seed script creates these users:
- `global-admin`
- `acme-admin`
- `acme-user`
- `globex-admin`
- `globex-user`

All seeded users share one password from `SEED_USER_PASSWORD`, or `BOOTSTRAP_ADMIN_PASSWORD` when the seed password is unset. Known defaults are refused. The production image ignores seed flags on the long-running process. `scripts/install.sh` and `scripts/seed.sh` pass `ALLOW_SEED=true` only for the one-shot seed.

When you run `scripts/install.sh` with `SEED_DATA=true`, the script auto-generates `SEED_USER_PASSWORD` in `.env` if it is blank or still set to a placeholder value.

[Go to TOC](#table-of-contents)

## Documentation
- [Operations guide](docs/operations.md)
- [Agent instructions](AGENTS.md)

[Go to TOC](#table-of-contents)

## Current Gaps
- Containerized stack validation depends on a valid local `.env`; helper scripts now normalize required aliases, but a real non-placeholder database/root password policy is still recommended.

[Go to TOC](#table-of-contents)

## Footer
This page is licensed under the
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).
