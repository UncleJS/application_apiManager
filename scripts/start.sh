#!/usr/bin/env bash
# start.sh — start all API Manager services via the pod unit
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

case "${1:-}" in
  -h|--help) printf 'Usage: %s\nEnv: JOB=<slug>, PORT_OFFSET=<n> select a job install.\n' "$(basename "$0")"; exit 0 ;;
esac

step "Starting api-manager$SFX services..."
systemctl --user start "$POD_SERVICE"
systemctl --user start "$(svc mariadb)" "$(svc backend)" "$(svc frontend)" "$(svc edge)"
pma=false
if systemctl --user cat "$(svc phpmyadmin)" >/dev/null 2>&1; then
  systemctl --user start "$(svc phpmyadmin)"
  pma=true
fi
green "Started. Endpoints:"
printf '  Frontend:   https://localhost:%s\n' "$WEB_PORT"
printf '  Backend:    https://localhost:%s\n' "$API_PORT"
if [ "$pma" = "true" ]; then
  printf '  phpMyAdmin: https://localhost:%s\n' "$PMA_PORT"
fi
printf '  API docs:   https://localhost:%s/docs when DOCS_ENABLED=true\n' "$API_PORT"
