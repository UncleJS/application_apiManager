#!/usr/bin/env bash
# install.sh — first-time setup for API Manager
# Copies Quadlet units, enables persistent container services, builds images,
# seeds Caddyfile into named volume, starts the generated pod unit, waits for DB,
# and runs migrations.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUADLET_DIR="$ROOT_DIR/.quadlet"
SYSTEMD_DIR="$HOME/.config/containers/systemd"
ENV_FILE="$ROOT_DIR/.env"
# Per project standard, Quadlet EnvironmentFile= references the repo-local .env
# directly — no host-level copy under ~/.config/containers/systemd/.
ENV_DEST="$ENV_FILE"
CADDYFILE="$ROOT_DIR/infra/caddy/Caddyfile"
PYTHON_BIN="$(command -v python3 || command -v python || true)"

# ── colour helpers ────────────────────────────────────────────────────────────
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
step()   { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

# ── argument parsing ──────────────────────────────────────────────────────────
# Linger keeps user services running after logout / across reboots. It changes
# host user state, so it is opt-in rather than silently enabled.
LINGER_MODE="ask"   # ask | yes | no
for arg in "$@"; do
  case "$arg" in
    --enable-linger) LINGER_MODE="yes" ;;
    --no-linger)     LINGER_MODE="no" ;;
    -h|--help)
      printf 'Usage: %s [--enable-linger|--no-linger]\n' "$(basename "$0")"
      printf '  --enable-linger  Enable systemd linger (boot persistence) without prompting\n'
      printf '  --no-linger      Skip enabling linger\n'
      exit 0 ;;
    *) red "Unknown argument: $arg"; exit 1 ;;
  esac
done

normalize_env_file() {
  "$PYTHON_BIN" - "$1" <<'PY'
from pathlib import Path
import secrets, string, sys

path = Path(sys.argv[1])
lines = path.read_text().splitlines()
entries = []
index = {}
for line in lines:
    if not line or line.lstrip().startswith('#') or '=' not in line:
        entries.append([None, line])
        continue
    key, value = line.split('=', 1)
    index[key] = len(entries)
    entries.append([key, value])

def get(key):
    pos = index.get(key)
    return entries[pos][1] if pos is not None else None

def setv(key, value):
    pos = index.get(key)
    if pos is None:
      index[key] = len(entries)
      entries.append([key, value])
    else:
      entries[pos][1] = value

def ensure_alias(dst, src):
    if not get(dst) and get(src):
        setv(dst, get(src))

ensure_alias('DB_DATABASE', 'MARIADB_DATABASE')
ensure_alias('DB_USER', 'MARIADB_USER')
ensure_alias('DB_PASSWORD', 'MARIADB_PASSWORD')
ensure_alias('NEXT_PUBLIC_API_URL', 'VITE_API_BASE_URL')

bootstrap_enabled = (get('BOOTSTRAP_ADMIN') or 'true').lower() != 'false'
default_passwords = {'', 'change_me', '010203!@', 'change_this_to_a_unique_strong_password'}
if bootstrap_enabled and (get('BOOTSTRAP_ADMIN_PASSWORD') or '') in default_passwords:
    alphabet = string.ascii_letters + string.digits + '-_!@#%^&*'
    generated = ''.join(secrets.choice(alphabet) for _ in range(32))
    setv('BOOTSTRAP_ADMIN_PASSWORD', generated)

if (get('SEED_DATA') or 'false').lower() == 'true' and (get('SEED_USER_PASSWORD') or '') in {'', 'change_this_for_seeded_users'}:
    alphabet = string.ascii_letters + string.digits + '-_!@#%^&*'
    generated = ''.join(secrets.choice(alphabet) for _ in range(24))
    setv('SEED_USER_PASSWORD', generated)

out = []
for key, value in entries:
    out.append(value if key is None else f'{key}={value}')
path.write_text('\n'.join(out) + '\n')
PY
}

# ── pre-flight ────────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  red "ERROR: .env not found. Copy .env.example to .env and fill in values."
  exit 1
fi

if ! command -v podman >/dev/null 2>&1; then
  red "ERROR: podman not found."
  exit 1
fi

if [ -z "$PYTHON_BIN" ]; then
  red "ERROR: python3 (or python) not found. Helper scripts require Python 3 on the host."
  exit 1
fi

# ── linger ────────────────────────────────────────────────────────────────────
if [ "$LINGER_MODE" = "ask" ]; then
  if [ -t 0 ]; then
    read -rp "Enable systemd linger for $USER (keeps services running across reboots/logout)? [y/N] " _ans
    case "$_ans" in [yY]|[yY][eE][sS]) LINGER_MODE="yes" ;; *) LINGER_MODE="no" ;; esac
  else
    LINGER_MODE="no"   # non-interactive default: do not change host user state silently
  fi
fi

if [ "$LINGER_MODE" = "yes" ]; then
  step "Enabling linger for $USER (boot persistence)"
  loginctl enable-linger "$USER"
else
  yellow "Skipping linger. Services will not auto-start on boot. Re-run with --enable-linger to enable, or: loginctl enable-linger $USER"
fi

# ── systemd user dir ──────────────────────────────────────────────────────────
step "Preparing systemd user unit directory"
mkdir -p "$SYSTEMD_DIR"

# Normalise the repo-local .env in place and lock it down; Quadlet units read it
# directly (no host-level copy).
normalize_env_file "$ENV_FILE"
chmod 600 "$ENV_FILE"
green "  Using repo-local env → $ENV_FILE"

# ── copy + patch Quadlet units ────────────────────────────────────────────────
step "Installing runtime Quadlet units → $SYSTEMD_DIR"
for unit in \
  "$QUADLET_DIR"/*.pod \
  "$QUADLET_DIR"/api-manager-db.volume \
  "$QUADLET_DIR"/api-manager-tls.volume \
  "$QUADLET_DIR"/api-manager-jwt.volume \
  "$QUADLET_DIR"/api-manager-caddy-config.volume \
  "$QUADLET_DIR"/api-manager-caddy-data.volume \
  "$QUADLET_DIR"/api-manager-mariadb.container \
  "$QUADLET_DIR"/api-manager-backend.container \
  "$QUADLET_DIR"/api-manager-frontend.container \
  "$QUADLET_DIR"/api-manager-phpmyadmin.container \
  "$QUADLET_DIR"/api-manager-edge.container; do
  dest="$SYSTEMD_DIR/$(basename "$unit")"
  cp "$unit" "$dest"
  # Resolve the __REPO_ENV__ placeholder to the absolute repo-local .env path
  sed -i "s|__REPO_ENV__|$ENV_FILE|g" "$dest"
  green "  $(basename "$unit")"
done

green "  Dev Quadlet is managed separately via scripts/dev.sh"

for stale_unit in api-manager-dev.container api-manager-dev.volume; do
  target="$SYSTEMD_DIR/$stale_unit"
  if [ -f "$target" ]; then
    rm -f "$target"
    green "  removed stale $stale_unit"
  fi
done

# ── daemon-reload ─────────────────────────────────────────────────────────────
step "Reloading systemd user daemon"
systemctl --user daemon-reload

# ── build images ─────────────────────────────────────────────────────────────
step "Building backend image (api-manager-backend:latest)"
podman build -f "$ROOT_DIR/backend/Containerfile" -t api-manager-backend:latest "$ROOT_DIR/backend"

step "Building frontend image (api-manager-frontend:latest)"
podman build -f "$ROOT_DIR/frontend/Containerfile" -t api-manager-frontend:latest "$ROOT_DIR/frontend"

# ── create named volumes (idempotent) ─────────────────────────────────────────
step "Creating named volumes"
for vol in api-manager-db api-manager-tls api-manager-jwt api-manager-caddy-config api-manager-caddy-data; do
  podman volume inspect "$vol" >/dev/null 2>&1 || podman volume create "$vol"
  green "  $vol"
done

# ── seed Caddyfile into named volume ──────────────────────────────────────────
step "Writing Caddyfile into api-manager-caddy-config volume"
podman run --rm -i \
  -v systemd-api-manager-caddy-config:/etc/caddy:Z \
  docker.io/library/busybox:latest \
  sh -lc 'cat > /etc/caddy/Caddyfile && echo "Caddyfile written"' < "$CADDYFILE"

# ── start services ────────────────────────────────────────────────────────────
step "Starting runtime systemd user container services"
green "  Quadlet applies [Install] from source units during generation; generated services are not enabled directly"
green "  Dev Quadlet is not installed by scripts/install.sh; use scripts/dev.sh for local development"

step "Starting generated api-manager pod unit and MariaDB"
systemctl --user start api-manager-pod-pod.service
systemctl --user start api-manager-mariadb.service

# ── wait for MariaDB ──────────────────────────────────────────────────────────
step "Waiting for MariaDB to be ready"
# Load DB root password from env file
DB_ROOT_PASSWORD="$(grep '^MARIADB_ROOT_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-root_password}"
RETRIES="${DB_WAIT_RETRIES:-60}"
DELAY_S=2
db_ready=false
for attempt in $(seq 1 "$RETRIES"); do
  if podman exec api-manager-mariadb \
       env MYSQL_PWD="$DB_ROOT_PASSWORD" mariadb-admin ping -h 127.0.0.1 -u root --silent 2>/dev/null; then
    db_ready=true
    break
  fi
  printf '  attempt %d/%d...\r' "$attempt" "$RETRIES"
  sleep "$DELAY_S"
done
if [ "$db_ready" != "true" ]; then
  red "ERROR: Database not ready after $RETRIES attempts."
  exit 1
fi
green "  MariaDB ready"

# ── run Drizzle migrations ────────────────────────────────────────────────────
step "Running database migrations"
podman run --rm \
  --pod api-manager-pod \
  --env DB_HOST=127.0.0.1 \
  --env DB_PORT=3306 \
  --env HOST=0.0.0.0 \
  --env PORT=3001 \
  --env-file "$ENV_DEST" \
  localhost/api-manager-backend:latest \
  bun run db:migrate

# ── optional seed ─────────────────────────────────────────────────────────────
SEED_DATA="$(grep '^SEED_DATA=' "$ENV_FILE" | cut -d= -f2- || echo 'false')"
SEED_ACCESS_LOGS="$(grep '^SEED_ACCESS_LOGS=' "$ENV_FILE" | cut -d= -f2- || echo 'false')"

if [ "$SEED_DATA" = "true" ] || [ "$SEED_ACCESS_LOGS" = "true" ]; then
  step "Seeding database"
  podman run --rm \
    --pod api-manager-pod \
    --env DB_HOST=127.0.0.1 \
    --env DB_PORT=3306 \
    --env HOST=0.0.0.0 \
    --env PORT=3001 \
    --env-file "$ENV_DEST" \
    -e SEED_DATA="$SEED_DATA" \
    -e SEED_ACCESS_LOGS="$SEED_ACCESS_LOGS" \
    localhost/api-manager-backend:latest \
    bun run seed
fi

step "Starting backend, frontend, phpMyAdmin, and edge services"
systemctl --user start \
  api-manager-backend.service \
  api-manager-frontend.service \
  api-manager-phpmyadmin.service \
  api-manager-edge.service

# ── done ──────────────────────────────────────────────────────────────────────
green ""
green "╔══════════════════════════════════════════════╗"
green "║  API Manager installed successfully          ║"
green "╠══════════════════════════════════════════════╣"
green "║  Frontend:   https://localhost:55000         ║"
green "║  Backend:    https://localhost:55001         ║"
green "║  phpMyAdmin: https://localhost:55002         ║"
green "║  API Docs:   https://localhost:55001/docs    ║"
green "╚══════════════════════════════════════════════╝"
green ""
yellow "Note: TLS certs are self-signed. Accept the browser warning"
yellow "for https://localhost:55001 before using the frontend."
