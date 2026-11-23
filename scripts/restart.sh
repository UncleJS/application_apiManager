#!/usr/bin/env bash
# restart.sh — stop, then start all API Manager services
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "${1:-}" in
  -h|--help) printf 'Usage: %s\nRuns stop.sh, then start.sh (honours JOB / PORT_OFFSET).\n' "$(basename "$0")"; exit 0 ;;
esac

"$DIR/stop.sh"
"$DIR/start.sh"
