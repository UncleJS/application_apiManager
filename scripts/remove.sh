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

PURGE="false"
if [ "${1:-}" = "--purge" ]; then
  PURGE="true"
fi

podman-compose "${ENV_ARGS[@]}" -f "$COMPOSE_FILE" down

podman pod rm -f "$POD_NAME" || true

if [ "$PURGE" = "true" ]; then
  removed_any="false"
  for volume in \
    api-manager-db-data \
    api-manager-tls \
    api-manager-jwt \
    api-manager-phpmyadmin-data \
    api-manager-phpmyadmin-config \
    infra_api-manager-db-data \
    infra_api-manager-tls \
    infra_api-manager-jwt \
    infra_api-manager-phpmyadmin-data \
    infra_api-manager-phpmyadmin-config; do
    if ! podman volume exists "$volume"; then
      continue
    fi

    in_use_by="$(podman ps -a --filter volume="$volume" --format "{{.Names}}" | tr '\n' ' ' | xargs)"
    if [ -n "$in_use_by" ]; then
      echo "Skipping volume $volume (in use by: $in_use_by)"
      continue
    fi

    pods_in_use="$(podman ps -a --filter volume="$volume" --format "{{.PodName}}" | sort -u)"
    for pod in $pods_in_use; do
      if [ -z "$pod" ] || [ "$pod" != "$POD_NAME" ]; then
        echo "Skipping volume $volume (used by pod: ${pod:-none})"
        continue 2
      fi
    done

    project_label="$(podman volume inspect "$volume" --format '{{.Labels.com.docker.compose.project}}' 2>/dev/null || true)"
    if [ "$project_label" = "<no value>" ] || [ "$project_label" = "null" ]; then
      project_label=""
    fi

    if [ -n "$project_label" ] && [ "$project_label" != "infra" ]; then
      echo "Skipping volume $volume (owned by compose project: $project_label)"
      continue
    fi

    if [ -z "$project_label" ]; then
      case "$volume" in
        infra_api-manager-*|api-manager-*)
          ;;
        *)
          echo "Skipping volume $volume (missing compose label)"
          continue
          ;;
      esac
    fi

    podman volume rm -f "$volume" >/dev/null 2>&1 || true
    removed_any="true"
  done

  if [ "$removed_any" = "true" ]; then
    echo "Volumes removed"
  else
    echo "No volumes removed"
  fi
else
  echo "Volumes preserved (use --purge to remove)"
fi

echo "Removal complete"
