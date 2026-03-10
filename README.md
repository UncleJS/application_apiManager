# API Manager

API gateway and admin console for managing proxied APIs with org-level access control, session auth, and usage reporting.

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
![Backend](https://img.shields.io/badge/backend-Node.js%20%2B%20TypeScript-43853D)
![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-61DAFB)
![Infra](https://img.shields.io/badge/infra-Podman%20Compose-892CA0)

## Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Repository Structure](#repository-structure)
- [Requirements](#requirements)
- [Quickstart (Podman Compose)](#quickstart-podman-compose)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Ports](#ports)
- [Authentication](#authentication)
- [Documentation](#documentation)
- [Current Gaps](#current-gaps)
- [Footer](#footer)

## Overview
This project includes:
- A backend reverse proxy and admin API (`backend/`) built with Fastify + TypeScript.
- A React admin UI (`frontend/`) for orgs, users, APIs, permissions, windows, reports, and active sessions.
- Podman Compose infrastructure (`infra/`) with MariaDB, backend, frontend, phpMyAdmin, and Caddy for HTTPS edge serving.

[Go to TOC](#table-of-contents)

## Key Features
- Longest-prefix reverse proxy routing from `base_path` to `target_url`.
- Role-based access control (`global_admin`, `org_admin`, `user`).
- DB-backed sessions with cookie `api_manager_session` and bearer token support (`sessionToken`).
- Time-window access constraints for APIs and users.
- Access and audit logging with report endpoints.
- Archive/unarchive workflow (no delete endpoints).

[Go to TOC](#table-of-contents)

## Repository Structure
- `backend/`: Node.js + TypeScript Fastify API/proxy
- `frontend/`: React admin UI
- `infra/`: Podman Compose + DB init
- `scripts/`: setup/build/rebuild/remove helpers
- `docs/`: plan and operations guides

[Go to TOC](#table-of-contents)

## Requirements
- Node.js 20+
- npm
- Podman + `podman-compose` (for containerized setup)

[Go to TOC](#table-of-contents)

## Quickstart (Podman Compose)
1. Copy env template:
```bash
cp .env.example .env
```
2. Build images:
```bash
scripts/build.sh
```
3. Start services and initialize DB:
```bash
scripts/setup.sh
```
4. Open:
- Frontend: `https://localhost:55000`
- Backend: `https://localhost:55001`
- phpMyAdmin: `https://localhost:55002`

Notes:
- Certificates are self-signed; browser warnings are expected.
- Visit `https://localhost:55001` once and accept the cert so the frontend can call the backend.
- After code changes in container mode, use `scripts/rebuild.sh`.
- To stop/remove: `scripts/remove.sh` (`--purge` also removes volumes when safe).

[Go to TOC](#table-of-contents)

## Local Development
Backend:
```bash
cd backend
npm install
npm run dev
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

Common commands:
- Backend build: `cd backend && npm run build`
- Backend lint: `cd backend && npm run lint`
- Frontend build: `cd frontend && npm run build`
- Frontend lint: `cd frontend && npm run lint`

[Go to TOC](#table-of-contents)

## Environment Variables
Set env in root `.env` (see `.env.example`).

Important values:
- `MARIADB_*` and `DB_ROOT_PASSWORD` for database bootstrap.
- `VITE_API_BASE_URL=https://localhost:55001`
- `CORS_ORIGIN=https://localhost:55000`
- `SESSION_IDLE_SECONDS`, `SESSION_HARD_MAX_SECONDS`
- `SEED_DATA`, `SEED_ACCESS_LOGS`

[Go to TOC](#table-of-contents)

## Ports
- `55000` frontend (via Caddy HTTPS)
- `55001` backend HTTPS
- `55002` phpMyAdmin (via Caddy HTTPS)
- MariaDB is internal-only in the pod

[Go to TOC](#table-of-contents)

## Authentication
- Browser/admin sessions: secure HTTP-only cookie `api_manager_session`.
- API clients: `POST /auth/login` with username/password, then send `Authorization: Bearer <sessionToken>`.
- Default seeded admin (when seeding is enabled): `global-admin` / `001002..Ad`.

[Go to TOC](#table-of-contents)

## Documentation
- [Operations guide](docs/operations.md)
- [Project plan](docs/plan.md)
- [Agent instructions](AGENTS.md)

[Go to TOC](#table-of-contents)

## Current Gaps
- No automated tests are configured yet.
- Existing lint debt remains in backend/frontend and is not fully cleaned.

[Go to TOC](#table-of-contents)

## Footer
This page is licensed under the
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).
