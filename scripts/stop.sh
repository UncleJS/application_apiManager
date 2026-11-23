#!/usr/bin/env bash
# stop.sh — stop all API Manager services
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

case "${1:-}" in
  -h|--help) printf 'Usage: %s\nEnv: JOB=<slug> selects a job install.\n' "$(basename "$0")"; exit 0 ;;
esac

step "Stopping api-manager$SFX services..."
systemctl --user stop "$(svc edge)" "$(svc phpmyadmin)" "$(svc frontend)" "$(svc backend)" "$(svc mariadb)" "$(svc dev)" || true
systemctl --user stop "$POD_SERVICE" || true
green "Stopped."
