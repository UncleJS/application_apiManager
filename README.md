# API Manager

API gateway and admin console for managing proxied APIs with org-level access control, session auth, and usage reporting.

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
![Backend](https://img.shields.io/badge/backend-Bun%20%2B%20Elysia%20%2B%20Drizzle-f472b6)
![Frontend](https://img.shields.io/badge/frontend-Next.js%2014%20%2B%20Tailwind-61DAFB)
![Infra](https://img.shields.io/badge/infra-Podman%20Quadlet-892CA0)

## Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Repository Structure](#repository-structure)
- [Requirements](#requirements)
- [Quickstart](#quickstart)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Ports](#ports)
- [Authentication](#authentication)
- [Documentation](#documentation)
- [Current Gaps](#current-gaps)
- [Footer](#footer)

## Overview
This project includes:
- A backend reverse proxy and admin API (`backend/`) built with **Bun + Elysia + Drizzle ORM** (TypeScript).
- A **Next.js 14 App Router** admin UI (`frontend/`) with Tailwind high-contrast dark theme for orgs, users, APIs, permissions, windows, reports, and active sessions.
- Rootless **Podman + systemd Quadlet** infrastructure (`.quadlet/`) with MariaDB, backend, frontend, phpMyAdmin, and Caddy for HTTPS edge serving.
- Caddy owns the public HTTPS ports; the backend runs on an internal-only HTTP port inside the pod.
- OpenAPI spec at `/openapi.json`; Swagger UI at `/docs`.

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
2. Install Quadlet units, create volumes, seed Caddy config, enable linger, start pod:
```bash
scripts/install.sh
```
3. Open:
   - Frontend: `https://localhost:55000`
   - Backend API / Swagger: `https://localhost:55001/docs`
   - phpMyAdmin: `https://localhost:55002`

Notes:
- Certificates are self-signed; browser warnings are expected.
- Visit `https://localhost:55001` once and accept the cert so the frontend can call the backend.
- After code changes, use `scripts/rebuild.sh` to rebuild images and restart.
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
- `55002` phpMyAdmin (via Caddy HTTPS)
- MariaDB is internal-only in the pod

[Go to TOC](#table-of-contents)

## Authentication
- Browser/admin sessions: secure HTTP-only cookie `api_manager_session`.
- API clients: `POST /auth/login` with username/password. The response returns `{ ok: true }` and sets the `api_manager_session` cookie.
- For non-browser clients, the session token can be taken from the `Set-Cookie` header and replayed as either the `api_manager_session` cookie or `Authorization: Bearer <token>`.
- Seeded/default passwords must be set to non-placeholder values before use.
- Public HTTPS is terminated by Caddy; the backend itself is internal HTTP-only inside the pod.

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
