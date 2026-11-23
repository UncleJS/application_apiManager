#!/usr/bin/env bash
# rebuild.sh — rebuild backend and/or frontend images and restart containers.
# Usage:
#   scripts/rebuild.sh            # rebuild both
#   scripts/rebuild.sh backend    # rebuild backend only
#   scripts/rebuild.sh frontend   # rebuild frontend only
set -euo pipefail

# shellcheck source=scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
TARGET="${1:-both}"

rebuild_backend() {
  "$ROOT_DIR/scripts/build.sh" backend
  step "Restarting $(svc backend)"
  systemctl --user start "$POD_SERVICE" >/dev/null 2>&1 || true
  systemctl --user restart "$(svc backend)"
  green "  Backend rebuilt and restarted"
}

rebuild_frontend() {
  "$ROOT_DIR/scripts/build.sh" frontend
  step "Restarting $(svc frontend)"
  systemctl --user start "$POD_SERVICE" >/dev/null 2>&1 || true
  systemctl --user restart "$(svc frontend)"
  green "  Frontend rebuilt and restarted"
}

case "$TARGET" in
  backend)  rebuild_backend  ;;
  frontend) rebuild_frontend ;;
  both)     rebuild_backend; rebuild_frontend ;;
  -h|--help) printf 'Usage: %s [backend|frontend|both]\n' "$0"; exit 0 ;;
  *)
    printf 'Usage: %s [backend|frontend|both]\n' "$0" >&2
    exit 1
    ;;
esac

green ""
green "Rebuild complete."
