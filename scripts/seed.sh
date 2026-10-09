#!/usr/bin/env bash
# seed.sh — run the seed script inside the backend container.
# Usage:
#   scripts/seed.sh                    # uses SEED_DATA + SEED_ACCESS_LOGS from .env
#   SEED_DATA=true scripts/seed.sh     # force seed data
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

SEED_DATA="${SEED_DATA:-$(grep '^SEED_DATA=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo 'false')}"
SEED_ACCESS_LOGS="${SEED_ACCESS_LOGS:-$(grep '^SEED_ACCESS_LOGS=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo 'false')}"

printf '\033[1;36m▶ Running seed (SEED_DATA=%s SEED_ACCESS_LOGS=%s)...\033[0m\n' "$SEED_DATA" "$SEED_ACCESS_LOGS"

podman exec \
  -e SEED_DATA="$SEED_DATA" \
  -e SEED_ACCESS_LOGS="$SEED_ACCESS_LOGS" \
  -e ALLOW_SEED=true \
  api-manager-backend bun run seed

printf '\033[0;32mSeed complete.\033[0m\n'
