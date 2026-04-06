# Infrastructure Review — API Manager
> Read-only audit · 2026-03-26

---

## 1. Architecture Overview

```
[User/Browser]
     │ HTTPS :55000/:55002
     ▼
[api-manager-edge] (caddy:2)          ← Quadlet: api-manager-edge.container
     │ reverse-proxy
     ├──▶ [api-manager-frontend] (Next.js standalone, :3000 inside pod)
     │         └── Quadlet: api-manager-frontend.container
     ├──▶ [api-manager-backend]  (Elysia/Bun, :55001 HTTPS inside pod)
     │         ├── Volume: api-manager-tls   (/data/tls)
     │         ├── Volume: api-manager-jwt   (/data/jwt)
     │         └── Quadlet: api-manager-backend.container
     └──▶ [api-manager-phpmyadmin] (phpmyadmin:5)
               └── Quadlet: api-manager-phpmyadmin.container

[api-manager-mariadb] (mariadb:11)
     └── Volume: api-manager-db (/var/lib/mysql)

[api-manager-dev] (UBI10-minimal + Bun, sleep-forever)
     └── Volume: api-manager-dev (/workspace)

All containers share: api-manager-pod (Podman pod, shared network namespace)
Caddy config/data:    api-manager-caddy-config / api-manager-caddy-data volumes
Systemd: rootless user services (~/.config/containers/systemd/), linger enabled
```

**Stack:** Podman pod (Quadlet) · MariaDB 11 · Elysia/Bun · Next.js 14 · Caddy 2 · phpMyAdmin 5  
**Entrypoint:** `scripts/install.sh` — copies Quadlet units, creates volumes, builds images, seeds Caddy config, runs Drizzle migrations.

---

## 2. Strengths

| # | Strength |
|---|----------|
| S1 | **Full Quadlet coverage** — every service has a typed `.container`/`.volume`/`.pod` unit; no raw `podman run` wrappers needed at runtime. |
| S2 | **Named volumes only** — no bind mounts for persistent data; `:Z` SELinux labels applied throughout. |
| S3 | **Healthchecks on all critical services** — MariaDB, backend, and frontend all have `HealthCmd` with sensible retries (6×). |
| S4 | **`After=` service ordering** — pod → mariadb → backend → frontend → caddy chain is correct and explicit. |
| S5 | **Idempotent `install.sh`** — `podman volume inspect` guard prevents duplicate volume creation; `sed` patch resolves `%h` placeholder. |
| S6 | **Linger enabled** — `loginctl enable-linger` called in `install.sh`, giving boot persistence without root. |
| S7 | **Multi-stage Containerfiles** — backend uses `deps`→`runner` split (bun install then COPY); frontend uses Next.js standalone output. |
| S8 | **`set -euo pipefail`** — all scripts fail-fast on errors. |
| S9 | **`infra/` reference compose** — useful drift-detection reference and onboarding aid. |
| S10 | **`logs.sh` covers all services** — including dev container; maps friendly names to systemd unit names. |

---

## 3. Concrete Risks & Issues (with file references)

### 🔴 HIGH

**R1 — `MARIADB_ROOT_PASSWORD` leaked in HealthCmd process list**  
File: `.quadlet/api-manager-mariadb.container`
```ini
HealthCmd=mariadb-admin ping -h 127.0.0.1 -u root -p${MARIADB_ROOT_PASSWORD} --silent
```
`${MARIADB_ROOT_PASSWORD}` is expanded into the process command line at container start time. On Linux, `/proc/<pid>/cmdline` is world-readable inside the pod's shared PID namespace. Any container in the pod can read it.  
**Fix:** Use `mariadb-admin ping ... --defaults-file=/run/secrets/mariadb-root.cnf` or pipe via `MYSQL_PWD` env var set only inside the health exec.

**R2 — `.env` file copied to `~/.config/containers/systemd/api-manager.env` in plaintext**  
File: `scripts/install.sh` (section "Copy env file so systemd can find it")  
The file contains `MARIADB_ROOT_PASSWORD`, `MARIADB_PASSWORD`, `BOOTSTRAP_ADMIN_PASSWORD`. It sits in a predictable path, readable by any process running as this user. There is no `chmod 600` call after copy.  
**Fix:** Add `chmod 600 "$ENV_DEST"` immediately after the `cp` line in `install.sh`.

**R3 — `phpmyadmin:5` and `caddy:2` use mutable floating tags**  
Files: `.quadlet/api-manager-phpmyadmin.container`, `.quadlet/api-manager-edge.container`  
`mariadb:11` and `phpmyadmin:5` are major-only tags; `caddy:2` is major-only. A `podman pull` on the next upgrade could silently introduce a breaking minor/patch change.  
**Fix:** Pin to digests or at minimum minor versions: `mariadb:11.4`, `phpmyadmin:5.2`, `caddy:2.9`.

**R4 — `api-manager-dev.volume` is never seeded with source code**  
File: `.quadlet/api-manager-dev.container` — mounts `api-manager-dev.volume:/workspace:Z`  
`Containerfile.dev` bakes source into the image at `/workspace` (build-time `COPY . /workspace`), but the Quadlet unit mounts a **named volume** over `/workspace`, shadowing the baked source entirely. The dev container starts with an empty workspace unless the user manually copies files in.  
**Fix:** Either remove the volume mount and use the baked-in source (acceptable for dev), or document that the user must `podman cp` or `podman run --rm` to seed the volume after every source change (`dev.sh` rebuilds the image but the volume still shadows it).

**R5 — No `Dependency=` / `Requires=` only `After=` in Quadlet units**  
Files: all `.container` units  
`After=api-manager-mariadb.service` ensures ordering but does **not** prevent the backend from starting if MariaDB fails to start. Combined with `Restart=always`, the backend will start, crash (DB unreachable), and restart in a tight loop until the 6-retry healthcheck stabilises — which works but produces noisy journal errors and can hit systemd's rate-limit restart throttle.  
**Fix:** Add `Requires=api-manager-mariadb.service` to `.quadlet/api-manager-backend.container` and similarly chain frontend→backend.

### 🟡 MEDIUM

**R6 — `install.sh` enables linger unconditionally without prompting**  
File: `scripts/install.sh` (section "── linger ──")  
The AGENTS.md rule says "Ask whether to enable linger when boot persistence is required." The script calls `loginctl enable-linger "$USER"` silently. On shared systems or systems where the operator does not want services surviving logout, this is unexpected.  
**Fix:** Gate behind `--enable-linger` flag or prompt the user (`read -rp "Enable linger for boot persistence? [y/N]"`).

**R7 — `BOOTSTRAP_ADMIN_PASSWORD` default value exposed in `.env.example`**  
File: `.env.example` line: `BOOTSTRAP_ADMIN_PASSWORD=010203!@`  
A real-looking (non-obviously-placeholder) default password in a committed example file is a credential-stuffing vector if copied verbatim to production.  
**Fix:** Replace with `BOOTSTRAP_ADMIN_PASSWORD=CHANGE_ME_STRONG_PASSWORD`.

**R8 — `infra/docker-compose.yml` uses bind mount for DB init SQL**  
File: `infra/docker-compose.yml`
```yaml
- ./db/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
```
The compose file is stated as reference-only, but it contains a bind mount. If anyone runs it directly (or CI does), this is a bind-mount violation. The Quadlet path correctly omits this (MariaDB uses env vars), but the divergence is a maintenance hazard.

**R9 — No pre-stop / graceful drain for backend**  
File: `.quadlet/api-manager-backend.container`  
There is no `ExecStop=` or `TimeoutStopSec=` set. Elysia/Bun will receive a `SIGTERM` and has a default 90-second systemd stop timeout. In-flight DB transactions and active session cookies have no drain period.  
**Fix:** Add `[Service] TimeoutStopSec=30` and ensure the Elysia app registers a SIGTERM handler to drain connections.

**R10 — `api-manager-dev.volume` included in `install.sh` volume creation but not in `uninstall.sh --purge` volume list**  
File: `scripts/install.sh` creates `api-manager-dev`; `scripts/uninstall.sh` purge loop **does** include it — this is actually consistent. ✅ (Noted as non-issue on second read.)

**R11 — `rebuild.sh` does not restart Caddy after frontend rebuild**  
File: `scripts/rebuild.sh`  
`rebuild_frontend` restarts `api-manager-frontend.service` but not `api-manager-edge.service`. If Caddy cached upstream state or config, it would not pick up changes. (Minor for a reverse-proxy with no upstream state, but worth noting for completeness.)

### 🟢 LOW

**R12 — No `--no-cache` option in `rebuild.sh`**  
File: `scripts/rebuild.sh`  
Stale Bun/node_modules layers can silently survive after `package.json` changes if the `COPY package.json` layer hash matches. A `--no-cache` flag or `--build-arg CACHE_BUST=$(date)` escape hatch would help.

**R13 — `infra/docker-compose.yml` references `pod:` key which is not standard Compose**  
File: `infra/docker-compose.yml`  
The `pod:` key is a Podman Compose extension. Running with Docker Compose would silently ignore it and create isolated bridge networks — all inter-container DNS would break. Should be documented as Podman-only.

---

## 4. Operational Gaps

| # | Gap | Impact |
|---|-----|--------|
| G1 | **No DB backup procedure** | `api-manager-db` volume has no documented dump/restore path; `--purge` is the only volume lifecycle documented. |
| G2 | **No log rotation config** | journald defaults apply; on a busy host with verbose access logs, journals could grow unbounded. Add `SystemMaxUse=` in `/etc/systemd/journald.conf` or a user override. |
| G3 | **TLS certificate lifecycle undefined** | `api-manager-tls` volume is seeded externally (cert/key must exist before backend starts). There is no `certbot`/`acme.sh` renewal hook or expiry check script. |
| G4 | **No readiness probe distinct from liveness** | All healthchecks are liveness-style (`/healthz` 200 OK). A slow Drizzle migration means the backend passes health while the schema is incomplete. |
| G5 | **No image pruning** | Each `rebuild.sh` creates a new `localhost/api-manager-backend:latest` but old dangling images accumulate. Add `podman image prune -f` to `rebuild.sh`. |
| G6 | **`seed.sh` has no idempotency guard** | Running `seed.sh` twice on production data would duplicate seed rows unless the seed script itself is idempotent (not verified from scripts alone). |
| G7 | **No update path for upstream images** | `mariadb:11`, `caddy:2`, `phpmyadmin:5` are never pulled in any script. Operator must manually `podman pull` + restart. No documented cadence. |
| G8 | **`api-manager-dev` service always enabled** | `install.sh` enables the dev container alongside production services. On a production host, a sleep-forever dev container is unnecessary attack surface. |

---

## 5. Top-Priority Recommendations

### P1 — Fix the credential leak in MariaDB HealthCmd (R1) + chmod the env file (R2)
These are the two highest-severity issues. The password in the healthcheck cmdline is readable by any co-tenant process. The env file must be mode `600`.

**Immediate actions:**
```bash
# In scripts/install.sh, after the cp line:
chmod 600 "$ENV_DEST"
```
```ini
# In .quadlet/api-manager-mariadb.container, replace HealthCmd with:
HealthCmd=sh -c 'MYSQL_PWD="${MARIADB_ROOT_PASSWORD}" mariadb-admin ping -h 127.0.0.1 -u root --silent'
```

### P2 — Pin all upstream image tags (R3)
Replace `caddy:2`, `phpmyadmin:5`, `mariadb:11` with pinned minor versions or SHA digests in all Quadlet units and `infra/docker-compose.yml`.

### P3 — Fix the dev container volume shadowing source (R4)
This is a silent breakage: the dev container starts with an empty `/workspace`. Either:
- **Option A (recommended):** Remove `Volume=api-manager-dev.volume:/workspace:Z` from `.quadlet/api-manager-dev.container` — use the baked-in source; run `dev.sh` to rebuild after changes.
- **Option B:** Keep the volume but add a step in `dev.sh` that seeds it: `podman cp "$ROOT_DIR/." api-manager-dev:/workspace/`.

### P4 — Add `Requires=` to enforce hard dependency ordering (R5)
Add to `.quadlet/api-manager-backend.container`:
```ini
[Unit]
Requires=api-manager-mariadb.service
After=api-manager-mariadb.service
```
This prevents the crash-restart loop on cold starts and keeps journals clean.

### P5 — Implement a DB backup script
Create `scripts/backup.sh` that runs:
```bash
podman exec api-manager-mariadb \
  sh -c 'mariadb-dump -u root -p"${MARIADB_ROOT_PASSWORD}" "${MARIADB_DATABASE}"' \
  > "backup-$(date +%F-%H%M).sql"
```
Document retention policy and wire to a systemd timer unit.

---

*No files were modified during this review.*
