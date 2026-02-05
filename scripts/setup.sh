#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/podman-compose.yml"
POD_NAME="api-manager-pod"
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-root_password}"
DB_HOST="${DB_HOST:-127.0.0.1}"
ENV_FILE="$ROOT_DIR/.env"
ENV_ARGS=()

if [ -f "$ENV_FILE" ]; then
  ENV_ARGS=(--env-file "$ENV_FILE")
fi

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

podman-compose "${ENV_ARGS[@]}" -f "$COMPOSE_FILE" up -d

echo "Waiting for database to be ready"
db_ready="false"
for attempt in $(seq 1 20); do
  if podman exec api-manager-mariadb mariadb-admin ping -h "$DB_HOST" -u root -p"$DB_ROOT_PASSWORD" --silent; then
    db_ready="true"
    break
  fi
  sleep 2
done

if [ "$db_ready" != "true" ]; then
  echo "Database not ready after retries" >&2
  exit 1
fi

missing_schema="false"
for table in organizations organization_statuses roles user_statuses api_definitions; do
  if ! podman exec api-manager-mariadb mariadb -h "$DB_HOST" -u root -p"$DB_ROOT_PASSWORD" -e "USE api_manager; SHOW TABLES LIKE '$table';" | grep -q "$table"; then
    missing_schema="true"
    break
  fi
done

if [ "$missing_schema" = "true" ]; then
  echo "Applying database schema"
  podman exec -i api-manager-mariadb mariadb -h "$DB_HOST" -u root -p"$DB_ROOT_PASSWORD" < "$ROOT_DIR/infra/db/init.sql"
fi

if ! podman exec api-manager-mariadb mariadb -h "$DB_HOST" -u root -p"$DB_ROOT_PASSWORD" -e "USE api_manager; SHOW COLUMNS FROM access_logs LIKE 'response_header_bytes';" | grep -q response_header_bytes; then
  echo "Applying schema update: response_header_bytes"
  podman exec api-manager-mariadb mariadb -h "$DB_HOST" -u root -p"$DB_ROOT_PASSWORD" -e "USE api_manager; ALTER TABLE access_logs ADD COLUMN response_header_bytes INT NOT NULL DEFAULT 0 AFTER response_bytes;"
fi

if [ "$SEED_DATA" = "true" ] || [ "$SEED_ACCESS_LOGS" = "true" ]; then
  if [ "$SEED_ACCESS_LOGS" = "true" ]; then
    existing_logs="$(podman exec api-manager-mariadb mariadb -h "$DB_HOST" -u root -p"$DB_ROOT_PASSWORD" -N -B -e "USE api_manager; SELECT COUNT(*) FROM access_logs;" 2>/dev/null || echo 0)"
    if [ "$existing_logs" -gt 0 ]; then
      echo "Access logs already seeded ($existing_logs rows). Skipping access log seed."
      SEED_ACCESS_LOGS="false"
    fi
  fi

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
