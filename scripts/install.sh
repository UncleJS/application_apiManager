#!/usr/bin/env bash
# install.sh — first-time setup for API Manager
# Copies Quadlet units, enables persistent container services, builds images,
# seeds Caddyfile into named volume, starts the generated pod unit, waits for DB,
# and runs migrations.
set -euo pipefail

# shellcheck source=scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
# Per project standard, Quadlet EnvironmentFile= references the repo-local .env
# directly — no host-level copy under ~/.config/containers/systemd/.
ENV_DEST="$ENV_FILE"
CADDYFILE="$ROOT_DIR/infra/caddy/Caddyfile"
PYTHON_BIN="$(command -v python3 || command -v python || true)"

# ── argument parsing ──────────────────────────────────────────────────────────
# Linger keeps user services running after logout / across reboots. It changes
# host user state, so it is opt-in rather than silently enabled.
LINGER_MODE="ask"   # ask | yes | no
ENABLE_PHPMYADMIN="false"
for arg in "$@"; do
  case "$arg" in
    --enable-linger) LINGER_MODE="yes" ;;
    --no-linger)     LINGER_MODE="no" ;;
    --enable-phpmyadmin) ENABLE_PHPMYADMIN="true" ;;
    -h|--help)
      printf 'Usage: %s [--enable-linger|--no-linger] [--enable-phpmyadmin]\n' "$(basename "$0")"
      printf '  --enable-linger       Enable systemd linger (boot persistence) without prompting\n'
      printf '  --no-linger           Skip enabling linger\n'
      printf '  --enable-phpmyadmin   Publish phpMyAdmin on https://localhost:%s\n' "$PMA_PORT"
      printf 'Env: JOB=<slug> suffixes every name with -<slug>; PORT_OFFSET=<n> adds n to every published port.\n'
      exit 0 ;;
    *) red "Unknown argument: $arg"; exit 1 ;;
  esac
done

normalize_env_file() {
  "$PYTHON_BIN" - "$1" "$2" "$WEB_PORT" "$API_PORT" <<'PY'
from pathlib import Path
import re, secrets, string, sys

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
def generate(length):
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

if bootstrap_enabled and (get('BOOTSTRAP_ADMIN_PASSWORD') or '') in default_passwords:
    setv('BOOTSTRAP_ADMIN_PASSWORD', generate(32))

db_placeholders = {'', 'change_me', 'api_manager_password', 'root_password', '010203!@'}

root_regenerated = False
password_regenerated = False
if (get('MARIADB_ROOT_PASSWORD') or '') in db_placeholders:
    setv('MARIADB_ROOT_PASSWORD', generate(32))
    root_regenerated = True
if (get('MARIADB_PASSWORD') or '') in db_placeholders:
    setv('MARIADB_PASSWORD', generate(32))
    password_regenerated = True
if password_regenerated or (get('DB_PASSWORD') or '') in db_placeholders:
    setv('DB_PASSWORD', get('MARIADB_PASSWORD'))
if root_regenerated or (get('DB_ROOT_PASSWORD') or '') in db_placeholders:
    setv('DB_ROOT_PASSWORD', get('MARIADB_ROOT_PASSWORD'))

if (get('SEED_DATA') or 'false').lower() == 'true' and (get('SEED_USER_PASSWORD') or '') in {'', 'change_this_for_seeded_users', 'change_me', '010203!@'}:
    setv('SEED_USER_PASSWORD', generate(24))

if len(sys.argv) > 2 and sys.argv[2] == 'true':
    setv('ENABLE_PHPMYADMIN', 'true')

# Keep local URLs on the ports this install publishes. Only empty values and
# plain https://localhost:<port> values are rewritten; custom hosts are kept.
local_url = re.compile(r'^https://localhost:[0-9]+$')
for key, port in (('CORS_ORIGIN', sys.argv[3]), ('NEXT_PUBLIC_API_URL', sys.argv[4])):
    current = get(key) or ''
    if current == '' or local_url.match(current):
        setv(key, f'https://localhost:{port}')

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
normalize_env_file "$ENV_FILE" "$ENABLE_PHPMYADMIN"
chmod 600 "$ENV_FILE"
green "  Using repo-local env → $ENV_FILE"

if [ "$ENABLE_PHPMYADMIN" != "true" ]; then
  env_pma="$(grep '^ENABLE_PHPMYADMIN=' "$ENV_FILE" | cut -d= -f2- || true)"
  if [ "$env_pma" = "true" ]; then
    ENABLE_PHPMYADMIN="true"
  fi
fi

python_reject_placeholder() {
  local key="$1"
  local value
  value="$(grep "^${key}=" "$ENV_FILE" | cut -d= -f2- || true)"
  case "$value" in
    ""|change_me|api_manager_password|root_password|010203!@)
      red "ERROR: ${key} is still a placeholder. Set a unique password in .env."
      exit 1
      ;;
  esac
}
python_reject_placeholder MARIADB_ROOT_PASSWORD
python_reject_placeholder MARIADB_PASSWORD
python_reject_placeholder DB_PASSWORD
python_reject_placeholder DB_ROOT_PASSWORD

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
  "$QUADLET_DIR"/api-manager-edge.container; do
  dest="$(unit_dest "$unit")"
  cp "$unit" "$dest"
  # Job suffix, port offset, and the absolute repo-local .env path
  render_file "$dest"
  green "  $(basename "$dest")"
done

if [ "$ENABLE_PHPMYADMIN" = "true" ]; then
  pma_dest="$(unit_dest "$QUADLET_DIR/api-manager-phpmyadmin.container")"
  cp "$QUADLET_DIR/api-manager-phpmyadmin.container" "$pma_dest"
  render_file "$pma_dest"
  pod_dest="$(unit_dest "$QUADLET_DIR/api-manager-pod.pod")"
  if ! grep -q "^PublishPort=${PMA_PORT}:${PMA_PORT}\$" "$pod_dest"; then
    printf '\nPublishPort=%s:%s\n' "$PMA_PORT" "$PMA_PORT" >> "$pod_dest"
  fi
  green "  $(basename "$pma_dest") (opt-in)"
else
  rm -f "$(unit_dest "$QUADLET_DIR/api-manager-phpmyadmin.container")"
  green "  phpMyAdmin skipped (pass --enable-phpmyadmin or set ENABLE_PHPMYADMIN=true)"
fi

green "  Dev Quadlet is managed separately via scripts/dev.sh"

for stale_unit in "api-manager-dev$SFX.container" "api-manager-dev$SFX.volume"; do
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
"$ROOT_DIR/scripts/build.sh"

# ── create named volumes (idempotent) ─────────────────────────────────────────
step "Creating named volumes"
for vol in "${VOLUMES[@]}"; do
  podman volume inspect "$vol" >/dev/null 2>&1 || podman volume create "$vol"
  green "  $vol"
done

# ── seed Caddyfile into named volume ──────────────────────────────────────────
step "Writing Caddyfile into $CADDY_CONFIG_VOLUME volume"
caddy_input="$(mktemp)"
trap 'rm -f "$caddy_input"' EXIT
cat "$CADDYFILE" > "$caddy_input"
if [ "$ENABLE_PHPMYADMIN" = "true" ]; then
  cat "$ROOT_DIR/infra/caddy/Caddyfile.phpmyadmin" >> "$caddy_input"
fi
render_file "$caddy_input"
podman run --rm -i \
  -v "$CADDY_CONFIG_VOLUME":/etc/caddy:Z \
  docker.io/library/busybox:latest \
  sh -lc 'cat > /etc/caddy/Caddyfile && echo "Caddyfile written"' < "$caddy_input"

# ── start services ────────────────────────────────────────────────────────────
step "Starting runtime systemd user container services"
green "  Quadlet applies [Install] from source units during generation; generated services are not enabled directly"
green "  Dev Quadlet is not installed by scripts/install.sh; use scripts/dev.sh for local development"

step "Starting generated api-manager pod unit and MariaDB"
systemctl --user start "$POD_SERVICE"
systemctl --user start "$(svc mariadb)"

# ── wait for MariaDB ──────────────────────────────────────────────────────────
step "Waiting for MariaDB to be ready"
# Load DB root password from env file
DB_ROOT_PASSWORD="$(grep '^MARIADB_ROOT_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
if [ -z "$DB_ROOT_PASSWORD" ]; then
  red "ERROR: MARIADB_ROOT_PASSWORD is empty."
  exit 1
fi
RETRIES="${DB_WAIT_RETRIES:-60}"
DELAY_S=2
db_ready=false
for attempt in $(seq 1 "$RETRIES"); do
  if podman exec "$CTR_MARIADB" \
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
  --pod "$POD_NAME" \
  --env DB_HOST=127.0.0.1 \
  --env DB_PORT=3306 \
  --env HOST=0.0.0.0 \
  --env PORT="$BACKEND_INTERNAL_PORT" \
  --env-file "$ENV_DEST" \
  "$IMAGE_BACKEND" \
  bun run db:migrate

# ── optional seed ─────────────────────────────────────────────────────────────
SEED_DATA="$(grep '^SEED_DATA=' "$ENV_FILE" | cut -d= -f2- || echo 'false')"
SEED_ACCESS_LOGS="$(grep '^SEED_ACCESS_LOGS=' "$ENV_FILE" | cut -d= -f2- || echo 'false')"

if [ "$SEED_DATA" = "true" ] || [ "$SEED_ACCESS_LOGS" = "true" ]; then
  step "Seeding database"
  podman run --rm \
    --pod "$POD_NAME" \
    --env DB_HOST=127.0.0.1 \
    --env DB_PORT=3306 \
    --env HOST=0.0.0.0 \
    --env PORT="$BACKEND_INTERNAL_PORT" \
    --env-file "$ENV_DEST" \
    -e SEED_DATA="$SEED_DATA" \
    -e SEED_ACCESS_LOGS="$SEED_ACCESS_LOGS" \
    -e ALLOW_SEED=true \
    "$IMAGE_BACKEND" \
    bun run seed
fi

step "Starting backend, frontend, and edge services"
systemctl --user start "$(svc backend)" "$(svc frontend)" "$(svc edge)"
if [ "$ENABLE_PHPMYADMIN" = "true" ]; then
  systemctl --user start "$(svc phpmyadmin)"
fi

# ── done ──────────────────────────────────────────────────────────────────────
green ""
green "API Manager installed successfully${JOB:+ (job $JOB)}"
green "  Frontend:   https://localhost:${WEB_PORT}"
green "  Backend:    https://localhost:${API_PORT}"
if [ "$ENABLE_PHPMYADMIN" = "true" ]; then
  green "  phpMyAdmin: https://localhost:${PMA_PORT}"
else
  green "  phpMyAdmin: disabled"
fi
green "  API docs:   set DOCS_ENABLED=true"
green ""
yellow "Note: TLS certs are self-signed. Accept the browser warning"
yellow "for https://localhost:${API_PORT} before using the frontend."
