#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/podman-compose.yml"
POD_NAME="api-manager-pod"

if ! command -v podman-compose >/dev/null 2>&1; then
  echo "podman-compose not found" >&2
  exit 1
fi

PURGE="false"
if [ "${1:-}" = "--purge" ]; then
  PURGE="true"
fi

podman-compose -f "$COMPOSE_FILE" down

podman pod rm -f "$POD_NAME" || true

if [ "$PURGE" = "true" ]; then
  podman volume rm -f api-manager-db-data api-manager-tls api-manager-jwt || true
  echo "Volumes removed"
else
  echo "Volumes preserved (use --purge to remove)"
fi

echo "Removal complete"
