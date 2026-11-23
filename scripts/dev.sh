#!/usr/bin/env bash
# dev.sh — build the dev container image and restart the dev unit.
# Run this after any source code changes during development.
set -euo pipefail

# shellcheck source=scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
case "${1:-}" in
  -h|--help) printf 'Usage: %s\nBuilds the dev image and (re)starts the dev container in the pod.\n' "$(basename "$0")"; exit 0 ;;
esac
QUADLET_SRC="$QUADLET_DIR/api-manager-dev.container"
# Quadlet EnvironmentFile= points at the repo-local .env directly (no host copy).
PYTHON_BIN="$(command -v python3 || command -v python || true)"


normalize_env_file() {
  "$PYTHON_BIN" - "$1" <<'PY'
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
default_passwords = {'', 'change_me', '010203!@', 'change_this_to_a_unique_strong_password'}
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
if [ -z "$PYTHON_BIN" ]; then
  printf '\033[0;31m%s\033[0m\n' "ERROR: python3 (or python) not found. Helper scripts require Python 3 on the host."
  exit 1
fi

mkdir -p "$SYSTEMD_DIR"
if [ -f "$ENV_FILE" ]; then
  normalize_env_file "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi
dev_dest="$(unit_dest "$QUADLET_SRC")"
cp "$QUADLET_SRC" "$dev_dest"
render_file "$dev_dest"

pod_dest="$(unit_dest "$QUADLET_DIR/api-manager-pod.pod")"
if [ ! -f "$pod_dest" ]; then
  cp "$QUADLET_DIR/api-manager-pod.pod" "$pod_dest"
  render_file "$pod_dest"
fi

systemctl --user daemon-reload

step "Building $IMAGE_DEV"
dev_opts=(--label "$IMAGE_LABEL" --layer-label "$IMAGE_LABEL")
if [ -n "$JOB" ]; then dev_opts+=(--layers=false); fi
podman build "${dev_opts[@]}" -f "$ROOT_DIR/Containerfile.dev" -t "$IMAGE_DEV" "$ROOT_DIR"

step "Restarting $(svc dev)"
systemctl --user start "$POD_SERVICE" >/dev/null 2>&1 || true
systemctl --user restart "$(svc dev)"

green ""
green "Dev container rebuilt and restarted."
green "Run commands inside it with:"
green "  podman exec -it $CTR_DEV sh               # shell"
green "  podman exec -it $CTR_DEV sh -lc 'cd /workspace/backend && bun run dev'"
green "  podman exec -it $CTR_DEV sh -lc 'cd /workspace/frontend && bun run dev'"
