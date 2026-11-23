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

# shellcheck source=scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
SERVICE="${1:-}"

case "$SERVICE" in
  backend|frontend|mariadb|edge|phpmyadmin|dev)
    exec journalctl --user -u "$(svc "$SERVICE")" -f --no-hostname
    ;;
  "")
    exec journalctl --user \
      -u "$(svc backend)" \
      -u "$(svc frontend)" \
      -u "$(svc mariadb)" \
      -f --no-hostname
    ;;
  -h|--help)
    printf 'Usage: %s [backend|frontend|mariadb|edge|phpmyadmin|dev]\n' "$0"
    exit 0
    ;;
  *)
    printf 'Usage: %s [backend|frontend|mariadb|edge|phpmyadmin|dev]\n' "$0" >&2
    exit 1
    ;;
esac
