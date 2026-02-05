#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/podman-compose.yml"
ENV_FILE="$ROOT_DIR/.env"
ENV_ARGS=()

if [ -f "$ENV_FILE" ]; then
  ENV_ARGS=(--env-file "$ENV_FILE")
fi

if ! command -v podman-compose >/dev/null 2>&1; then
  echo "podman-compose not found" >&2
  exit 1
fi

podman-compose "${ENV_ARGS[@]}" -f "$COMPOSE_FILE" build

echo "Build complete"
