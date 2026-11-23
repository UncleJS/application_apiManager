#!/usr/bin/env bash
# build.sh — build (or rebuild) the API Manager backend and frontend images.
# Usage:
#   scripts/build.sh            # build both
#   scripts/build.sh backend    # backend only
#   scripts/build.sh frontend   # frontend only
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

TARGET="${1:-both}"
case "$TARGET" in
  -h|--help)
    printf 'Usage: %s [backend|frontend|both]\n' "$(basename "$0")"
    printf 'Env: JOB=<slug> builds job-suffixed image tags.\n'
    exit 0 ;;
  backend|frontend|both) ;;
  *) printf 'Usage: %s [backend|frontend|both]\n' "$(basename "$0")" >&2; exit 1 ;;
esac

# The final image and every intermediate layer image carry the repo label, so
# uninstall.sh can remove the build cache without touching other repos. Job
# builds keep no layer cache, so a job and the main install never share layers.
build_opts=(--label "$IMAGE_LABEL" --layer-label "$IMAGE_LABEL")
if [ -n "$JOB" ]; then build_opts+=(--layers=false); fi

if [ "$TARGET" != "frontend" ]; then
  step "Building backend image ($IMAGE_BACKEND)"
  podman build "${build_opts[@]}" -f "$ROOT_DIR/backend/Containerfile" -t "$IMAGE_BACKEND" "$ROOT_DIR/backend"
fi
if [ "$TARGET" != "backend" ]; then
  step "Building frontend image ($IMAGE_FRONTEND)"
  podman build "${build_opts[@]}" -f "$ROOT_DIR/frontend/Containerfile" -t "$IMAGE_FRONTEND" "$ROOT_DIR/frontend"
fi
