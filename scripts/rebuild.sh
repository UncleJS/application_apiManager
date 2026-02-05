#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/podman-compose.yml"
POD_NAME="api-manager-pod"
ENV_FILE="$ROOT_DIR/.env"
ENV_ARGS=()

if [ -f "$ENV_FILE" ]; then
  ENV_ARGS=(--env-file "$ENV_FILE")
fi

if ! command -v podman-compose >/dev/null 2>&1; then
  echo "podman-compose not found" >&2
  exit 1
fi

podman-compose "${ENV_ARGS[@]}" -f "$COMPOSE_FILE" down

if ! podman pod exists "$POD_NAME"; then
  podman pod create --name "$POD_NAME" --share net
fi

if [ "$(podman pod inspect "$POD_NAME" --format '{{.State}}')" != "Running" ]; then
  podman pod start "$POD_NAME"
fi

podman-compose "${ENV_ARGS[@]}" -f "$COMPOSE_FILE" build
podman-compose "${ENV_ARGS[@]}" -f "$COMPOSE_FILE" up -d

echo "Rebuild complete"
