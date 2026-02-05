#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/podman-compose.yml"
POD_NAME="api-manager-pod"
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-root_password}"

if ! command -v podman-compose >/dev/null 2>&1; then
  echo "podman-compose not found" >&2
  exit 1
fi

SEED_DATA="${SEED_DATA:-false}"
SEED_ACCESS_LOGS="${SEED_ACCESS_LOGS:-false}"
export SEED_DATA
export SEED_ACCESS_LOGS

if [ "$SEED_DATA" = "true" ]; then
  echo "Starting with seed data enabled"
fi

if ! podman pod exists "$POD_NAME"; then
  podman pod create --name "$POD_NAME" --share net
fi

if [ "$(podman pod inspect "$POD_NAME" --format '{{.State}}')" != "Running" ]; then
  podman pod start "$POD_NAME"
fi

podman-compose -f "$COMPOSE_FILE" up -d

echo "Waiting for database to be ready"
for attempt in $(seq 1 20); do
  if podman exec api-manager-mariadb mariadb-admin ping -u root -p"$DB_ROOT_PASSWORD" --silent; then
    break
  fi
  sleep 2
done

if ! podman exec api-manager-mariadb mariadb -u root -p"$DB_ROOT_PASSWORD" -e "USE api_manager; SHOW TABLES LIKE 'organizations';" | grep -q organizations; then
  echo "Applying database schema"
  podman exec -i api-manager-mariadb mariadb -u root -p"$DB_ROOT_PASSWORD" < "$ROOT_DIR/infra/db/init.sql"
fi

if [ "$SEED_DATA" = "true" ] || [ "$SEED_ACCESS_LOGS" = "true" ]; then
  echo "Seeding database (may take a few minutes for access logs)"
  for attempt in $(seq 1 20); do
    if [ "$(podman inspect api-manager-backend --format '{{.State.Running}}')" = "true" ]; then
      if podman exec -e SEED_DATA="$SEED_DATA" -e SEED_ACCESS_LOGS="$SEED_ACCESS_LOGS" api-manager-backend node dist/scripts/seed.js; then
        break
      fi
    fi
    sleep 4
  done
fi

echo "Setup complete"
