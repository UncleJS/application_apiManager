#!/usr/bin/env bash
# rebuild.sh — rebuild backend and/or frontend images and restart containers.
# Usage:
#   scripts/rebuild.sh            # rebuild both
#   scripts/rebuild.sh backend    # rebuild backend only
#   scripts/rebuild.sh frontend   # rebuild frontend only
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-both}"

green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
step()   { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

rebuild_backend() {
  step "Building api-manager-backend:latest"
  podman build -f "$ROOT_DIR/backend/Containerfile" -t api-manager-backend:latest "$ROOT_DIR/backend"
  step "Restarting api-manager-backend"
  systemctl --user start api-manager-pod-pod.service >/dev/null 2>&1 || true
  systemctl --user restart api-manager-backend.service
  green "  Backend rebuilt and restarted"
}

rebuild_frontend() {
  step "Building api-manager-frontend:latest"
  podman build -f "$ROOT_DIR/frontend/Containerfile" -t api-manager-frontend:latest "$ROOT_DIR/frontend"
  step "Restarting api-manager-frontend"
  systemctl --user start api-manager-pod-pod.service >/dev/null 2>&1 || true
  systemctl --user restart api-manager-frontend.service
  green "  Frontend rebuilt and restarted"
}

case "$TARGET" in
  backend)  rebuild_backend  ;;
  frontend) rebuild_frontend ;;
  both)     rebuild_backend; rebuild_frontend ;;
  *)
    printf 'Usage: %s [backend|frontend|both]\n' "$0" >&2
    exit 1
    ;;
esac

green ""
green "Rebuild complete."
