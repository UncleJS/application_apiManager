#!/usr/bin/env bash
# logs.sh — stream logs for API Manager services via journalctl.
# Usage:
#   scripts/logs.sh                # tail backend + frontend + mariadb
#   scripts/logs.sh backend        # tail backend only
#   scripts/logs.sh frontend       # tail frontend only
#   scripts/logs.sh mariadb        # tail mariadb only
#   scripts/logs.sh edge           # tail caddy only
#   scripts/logs.sh phpmyadmin     # tail phpMyAdmin only
#   scripts/logs.sh dev            # tail dev container only
set -euo pipefail

SERVICE="${1:-}"

case "$SERVICE" in
  backend|frontend|mariadb|edge|phpmyadmin|dev)
    exec journalctl --user -u "api-manager-${SERVICE}.service" -f --no-hostname
    ;;
  "")
    exec journalctl --user \
      -u api-manager-backend.service \
      -u api-manager-frontend.service \
      -u api-manager-mariadb.service \
      -f --no-hostname
    ;;
  *)
    printf 'Usage: %s [backend|frontend|mariadb|edge|phpmyadmin|dev]\n' "$0" >&2
    exit 1
    ;;
esac
