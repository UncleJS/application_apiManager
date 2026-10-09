# Scripts

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
![Infra](https://img.shields.io/badge/infra-Podman%20Quadlet-892CA0)
![Shell](https://img.shields.io/badge/shell-POSIX-4EAA25)

POSIX shell scripts for managing the API Manager application lifecycle.
All scripts must be run from the **repo root** (or any directory — they resolve paths relative to their own location).

**Requirements (host OS):**
- `podman` — container runtime
- `python3` (or `python`) — used by `install.sh` and `dev.sh` to normalise `.env`
- `systemd` user session with lingering enabled (`loginctl enable-linger $USER`)
- `.env` at repo root — copy from `.env.example` and fill in values before first run

## Table of Contents
- [Lifecycle scripts](#lifecycle-scripts)
  - [install.sh](#installsh)
  - [start.sh](#startsh)
  - [stop.sh](#stopsh)
  - [rebuild.sh](#rebuildsh)
  - [uninstall.sh](#uninstallsh)
- [Development scripts](#development-scripts)
  - [dev.sh](#devsh)
  - [logs.sh](#logssh)
  - [seed.sh](#seedsh)
- [Environment variables](#environment-variables)
- [Typical workflow](#typical-workflow)
- [Footer](#footer)

---

## Lifecycle scripts

Run these in order for a fresh installation.

### `install.sh`

First-time setup. Idempotent — safe to re-run.

**What it does:**
1. Checks prerequisites (`podman`, `python3`, `.env`)
2. Asks about systemd user linger, or honours `--enable-linger` / `--no-linger`
3. Normalises `.env` — patches missing aliases (`DB_*` ← `MARIADB_*`, `NEXT_PUBLIC_API_URL` ← `VITE_API_BASE_URL`) and auto-generates strong passwords for `BOOTSTRAP_ADMIN_PASSWORD` and `SEED_USER_PASSWORD` if they are still set to placeholder values
4. Copies Quadlet units from `.quadlet/` → `~/.config/containers/systemd/` and rewrites the `EnvironmentFile=` path. phpMyAdmin is included only with `--enable-phpmyadmin` or `ENABLE_PHPMYADMIN=true`
5. Runs `systemctl --user daemon-reload`
6. Builds `api-manager-backend:latest` and `api-manager-frontend:latest`
7. Creates named volumes (`api-manager-db`, `api-manager-tls`, `api-manager-jwt`, `api-manager-caddy-config`, `api-manager-caddy-data`)
8. Seeds the `Caddyfile` into the `api-manager-caddy-config` volume
9. Starts the pod and MariaDB, waits for DB readiness
10. Runs Drizzle migrations inside the backend container
11. Optionally runs the seed script if `SEED_DATA=true` in `.env`, with `ALLOW_SEED=true` on that one-shot container only

**Usage:**
```bash
scripts/install.sh
```

**Options:** `--enable-linger`, `--no-linger`, `--enable-phpmyadmin`.

---

### `start.sh`

Start all production services.

**What it does:** Starts the pod, MariaDB, backend, frontend, and Caddy. phpMyAdmin starts only when its unit is installed.

**Usage:**
```bash
scripts/start.sh
```

**Endpoints after start:**

| Service    | URL                          |
|------------|------------------------------|
| Frontend   | https://localhost:55000      |
| Backend    | https://localhost:55001      |
| phpMyAdmin | https://localhost:55002 when enabled |
| API Docs   | https://localhost:55001/docs when `DOCS_ENABLED=true` |

**No options or arguments.**

---

### `stop.sh`

Stop all services (pod and individual containers).

**Usage:**
```bash
scripts/stop.sh
```

**No options or arguments.**

---

### `rebuild.sh`

Rebuild container image(s) and restart the corresponding service(s). Use this after code changes in production.

**Usage:**
```bash
scripts/rebuild.sh               # rebuild backend and frontend (default)
scripts/rebuild.sh backend       # rebuild backend only
scripts/rebuild.sh frontend      # rebuild frontend only
```

| Argument   | Effect                                                        |
|------------|---------------------------------------------------------------|
| _(none)_   | Builds `api-manager-backend:latest` and `api-manager-frontend:latest`, restarts both services |
| `backend`  | Builds `api-manager-backend:latest`, restarts `api-manager-backend.service` |
| `frontend` | Builds `api-manager-frontend:latest`, restarts `api-manager-frontend.service` |

> The pod unit is started automatically if it is not already running before restarting a container service.

---

### `uninstall.sh`

Stop, disable, and remove all Quadlet unit files. Data volumes are **retained by default**.

**Usage:**
```bash
scripts/uninstall.sh             # remove units, keep volumes
scripts/uninstall.sh --purge     # remove units AND delete named volumes (irreversible)
```

| Option    | Effect                                                                 |
|-----------|------------------------------------------------------------------------|
| _(none)_  | Stops services, removes unit files from `~/.config/containers/systemd/`, runs `daemon-reload` |
| `--purge` | Additionally prompts for interactive confirmation (`YES`), then deletes all named volumes |

**Volumes deleted by `--purge`** (both bare and `systemd-` prefixed variants):

| Volume                   | Contents                   |
|--------------------------|----------------------------|
| `api-manager-db`         | MariaDB data directory     |
| `api-manager-tls`        | Unused legacy volume (Caddy data is `api-manager-caddy-data`) |
| `api-manager-jwt`        | Unused legacy volume       |
| `api-manager-caddy-config` | Caddy configuration      |
| `api-manager-caddy-data` | Caddy ACME / data          |
| `api-manager-dev`        | Dev container layer cache  |

> **Warning:** `--purge` is irreversible. All database data will be lost.

[Go to TOC](#table-of-contents)

---

## Development scripts

### `dev.sh`

Build the dev container image and restart the dev unit. Run this after any source code change during local development.

**What it does:**
1. Normalises `.env` (same logic as `install.sh`)
2. Copies `api-manager.env` to `~/.config/containers/systemd/`
3. Copies `.quadlet/api-manager-dev.container` to the systemd unit directory
4. Runs `systemctl --user daemon-reload`
5. Builds `api-manager-dev:latest` from `Containerfile.dev` (UBI10-minimal + Bun)
6. Restarts `api-manager-dev.service`

**Usage:**
```bash
scripts/dev.sh
```

**No options or arguments.**

After the dev container is running, use `podman exec` to work inside it:

```bash
# Interactive shell
podman exec -it api-manager-dev sh

# Run backend dev server
podman exec -it api-manager-dev sh -lc 'cd /workspace/backend && bun run dev'

# Run frontend dev server
podman exec -it api-manager-dev sh -lc 'cd /workspace/frontend && bun run dev'
```

---

### `logs.sh`

Stream live logs via `journalctl` for one or more services.

**Usage:**
```bash
scripts/logs.sh                  # tail backend + frontend + mariadb (default)
scripts/logs.sh backend          # tail backend only
scripts/logs.sh frontend         # tail frontend only
scripts/logs.sh mariadb          # tail mariadb only
scripts/logs.sh edge             # tail Caddy (edge) only
scripts/logs.sh phpmyadmin       # tail phpMyAdmin only
scripts/logs.sh dev              # tail dev container only
```

| Argument      | systemd unit                        |
|---------------|-------------------------------------|
| _(none)_      | backend + frontend + mariadb        |
| `backend`     | `api-manager-backend.service`       |
| `frontend`    | `api-manager-frontend.service`      |
| `mariadb`     | `api-manager-mariadb.service`       |
| `edge`        | `api-manager-edge.service`          |
| `phpmyadmin`  | `api-manager-phpmyadmin.service`    |
| `dev`         | `api-manager-dev.service`           |

---

### `seed.sh`

Run the seed script inside the running backend container. Reads `SEED_DATA` and `SEED_ACCESS_LOGS` from `.env` by default; both can be overridden inline. The command sets `ALLOW_SEED=true` so the production image accepts that one-shot run.

**Usage:**
```bash
scripts/seed.sh                              # uses SEED_DATA and SEED_ACCESS_LOGS from .env
SEED_DATA=true scripts/seed.sh               # force-enable data seed
SEED_ACCESS_LOGS=true scripts/seed.sh        # force-enable access-log seed
SEED_DATA=true SEED_ACCESS_LOGS=true scripts/seed.sh   # enable both
```

| Environment variable | Default (from `.env`) | Effect                                       |
|----------------------|-----------------------|----------------------------------------------|
| `SEED_DATA`          | `false`               | Seed sample API managers, users, and proxies |
| `SEED_ACCESS_LOGS`   | `false`               | Seed sample access-log entries               |

> The backend container (`api-manager-backend`) must be running before calling this script.

[Go to TOC](#table-of-contents)

---

## Environment variables

Script-relevant variables from `.env` (full list in `.env.example`):

| Variable                  | Default / placeholder                        | Used by           | Description                                                     |
|---------------------------|----------------------------------------------|-------------------|-----------------------------------------------------------------|
| `MARIADB_ROOT_PASSWORD`   | `change_me`                                  | install.sh        | MariaDB root password                                           |
| `MARIADB_DATABASE`        | `api_manager`                                | install.sh        | Database name (aliased to `DB_DATABASE`)                        |
| `MARIADB_USER`            | `api_manager`                                | install.sh        | Database user (aliased to `DB_USER`)                            |
| `MARIADB_PASSWORD`        | `change_me`                                  | install.sh        | Database user password (aliased to `DB_PASSWORD`)               |
| `DB_WAIT_RETRIES`         | `60`                                         | install.sh        | Number of times to poll MariaDB before giving up                |
| `DB_WAIT_DELAY_MS`        | `2000`                                       | install.sh        | Milliseconds between DB readiness polls                         |
| `BOOTSTRAP_ADMIN_PASSWORD`| `change_this_to_a_unique_strong_password`    | install.sh, dev.sh | Initial admin password — auto-generated if left as placeholder |
| `SEED_USER_PASSWORD`      | `change_this_for_seeded_users`               | install.sh, seed.sh | Password for seeded users — auto-generated if left as placeholder |
| `SEED_DATA`               | `false`                                      | install.sh, seed.sh | Seed sample data on startup / seed run                         |
| `SEED_ACCESS_LOGS`        | `false`                                      | seed.sh           | Seed sample access-log entries                                  |
| `NEXT_PUBLIC_API_URL`     | `https://localhost:55001`                    | install.sh, dev.sh | Frontend → backend API URL (aliased from `VITE_API_BASE_URL`)  |
| `CORS_ORIGIN`             | `https://localhost:55000`                    | install.sh        | Allowed CORS origin for the backend                             |

[Go to TOC](#table-of-contents)

---

## Typical workflow

```bash
# 1. First-time setup
cp .env.example .env
# edit .env — set passwords, ports, etc.
scripts/install.sh

# 2. Daily start / stop
scripts/start.sh
scripts/stop.sh

# 3. After a code change (production rebuild)
scripts/rebuild.sh backend      # or frontend / omit for both

# 4. Local development
scripts/dev.sh                  # rebuild dev image
podman exec -it api-manager-dev sh -lc 'cd /workspace/backend && bun run dev'

# 5. Seed sample data
scripts/seed.sh

# 6. Watch logs
scripts/logs.sh                 # all services
scripts/logs.sh backend         # backend only

# 7. Full removal
scripts/stop.sh
scripts/uninstall.sh            # keep data
scripts/uninstall.sh --purge    # delete everything
```

[Go to TOC](#table-of-contents)

---

## Footer

This page is licensed under the
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).
