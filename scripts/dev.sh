#!/usr/bin/env bash
# dev.sh — build the dev container image and restart the dev unit.
# Run this after any source code changes during development.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="api-manager"
SYSTEMD_DIR="$HOME/.config/containers/systemd"
QUADLET_SRC="$ROOT_DIR/.quadlet/api-manager-dev.container"
ENV_FILE="$ROOT_DIR/.env"
ENV_DEST="$SYSTEMD_DIR/api-manager.env"

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }

normalize_env_file() {
  python - "$1" <<'PY'
from pathlib import Path
import secrets, string, sys

path = Path(sys.argv[1])
if not path.exists():
    raise SystemExit(0)
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
default_passwords = {'', 'change_me', '001002..Ad', 'change_this_to_a_unique_strong_password'}
if bootstrap_enabled and (get('BOOTSTRAP_ADMIN_PASSWORD') or '') in default_passwords:
    alphabet = string.ascii_letters + string.digits + '-_!@#%^&*'
    generated = ''.join(secrets.choice(alphabet) for _ in range(32))
    setv('BOOTSTRAP_ADMIN_PASSWORD', generated)

out = []
for key, value in entries:
    out.append(value if key is None else f'{key}={value}')
path.write_text('\n'.join(out) + '\n')
PY
}

step "Preparing dev Quadlet unit"
mkdir -p "$SYSTEMD_DIR"
if [ -f "$ENV_FILE" ]; then
  normalize_env_file "$ENV_FILE"
  cp "$ENV_FILE" "$ENV_DEST"
  normalize_env_file "$ENV_DEST"
  chmod 600 "$ENV_DEST"
fi
cp "$QUADLET_SRC" "$SYSTEMD_DIR/api-manager-dev.container"
sed -i "s|%h/.config/containers/systemd/api-manager.env|$ENV_DEST|g" "$SYSTEMD_DIR/api-manager-dev.container"

if [ ! -f "$SYSTEMD_DIR/api-manager-pod.pod" ]; then
  cp "$ROOT_DIR/.quadlet/api-manager-pod.pod" "$SYSTEMD_DIR/api-manager-pod.pod"
fi

systemctl --user daemon-reload

step "Building ${PROJECT_NAME}-dev:latest"
podman build -f "$ROOT_DIR/Containerfile.dev" -t "${PROJECT_NAME}-dev:latest" "$ROOT_DIR"

step "Restarting ${PROJECT_NAME}-dev service"
systemctl --user enable api-manager-dev.service >/dev/null 2>&1 || true
systemctl --user start api-manager-pod-pod.service >/dev/null 2>&1 || true
systemctl --user restart "${PROJECT_NAME}-dev.service"

green ""
green "Dev container rebuilt and restarted."
green "Run commands inside it with:"
green "  podman exec -it api-manager-dev sh               # shell"
green "  podman exec -it api-manager-dev sh -lc 'cd /workspace/backend && bun run dev'"
green "  podman exec -it api-manager-dev sh -lc 'cd /workspace/frontend && bun run dev'"
