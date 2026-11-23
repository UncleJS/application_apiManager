#!/usr/bin/env bash
# common.sh — shared names, ports and helpers for the API Manager scripts.
# Sourced by the other scripts; not meant to be run directly.
#
# Parallel installs: set JOB=<slug> to suffix every Podman/systemd name with
# "-<slug>", and PORT_OFFSET=<n> to add <n> to every published port, e.g.
#   JOB=test PORT_OFFSET=3000 scripts/install.sh
# Without JOB the names are unchanged; PORT_OFFSET defaults to 0.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUADLET_DIR="$ROOT_DIR/.quadlet"
SYSTEMD_DIR="$HOME/.config/containers/systemd"
ENV_FILE="$ROOT_DIR/.env"

JOB="${JOB:-}"
PORT_OFFSET="${PORT_OFFSET:-0}"
case "$JOB" in
  *[!a-z0-9-]*) printf 'JOB must be lowercase letters, digits and dashes: %s\n' "$JOB" >&2; exit 1 ;;
esac
case "$PORT_OFFSET" in
  ''|*[!0-9]*) printf 'PORT_OFFSET must be a non-negative integer: %s\n' "$PORT_OFFSET" >&2; exit 1 ;;
esac
SFX="${JOB:+-$JOB}"

# ── ports ─────────────────────────────────────────────────────────────────────
# Registered range for this repo (00_repoMan). Layout: start+0 web, start+1 API,
# start+2 phpMyAdmin. Caddy listens on the same port inside the pod as on the
# host. Pod-internal: frontend 3000, backend 3001, MariaDB 3306 (never published).
PORT_RANGE=55000-55002
WEB_PORT_BASE=55000
API_PORT_BASE=55001
PMA_PORT_BASE=55002
WEB_PORT=$((WEB_PORT_BASE + PORT_OFFSET))
API_PORT=$((API_PORT_BASE + PORT_OFFSET))
PMA_PORT=$((PMA_PORT_BASE + PORT_OFFSET))
FRONTEND_INTERNAL_PORT=3000
BACKEND_INTERNAL_PORT=3001

# ── names ─────────────────────────────────────────────────────────────────────
# Base names as they appear in .quadlet/ and the image tags; each gets $SFX.
BASE_NAMES=(
  api-manager-pod
  api-manager-mariadb
  api-manager-backend
  api-manager-frontend
  api-manager-edge
  api-manager-phpmyadmin
  api-manager-dev
  api-manager-db
  api-manager-tls
  api-manager-jwt
  api-manager-caddy-config
  api-manager-caddy-data
)
POD_NAME="api-manager-pod$SFX"
POD_SERVICE="api-manager-pod$SFX-pod.service"
CTR_MARIADB="api-manager-mariadb$SFX"
CTR_BACKEND="api-manager-backend$SFX"
CTR_FRONTEND="api-manager-frontend$SFX"
CTR_EDGE="api-manager-edge$SFX"
CTR_PHPMYADMIN="api-manager-phpmyadmin$SFX"
CTR_DEV="api-manager-dev$SFX"
IMAGE_BACKEND="localhost/api-manager-backend$SFX:latest"
IMAGE_FRONTEND="localhost/api-manager-frontend$SFX:latest"
IMAGE_DEV="localhost/api-manager-dev$SFX:latest"
# Volumes as named in .quadlet/ (Quadlet creates them as systemd-<name>).
VOLUMES=(
  "api-manager-db$SFX"
  "api-manager-tls$SFX"
  "api-manager-jwt$SFX"
  "api-manager-caddy-config$SFX"
  "api-manager-caddy-data$SFX"
)
CADDY_CONFIG_VOLUME="systemd-api-manager-caddy-config$SFX"
# Third-party images pulled for this repo.
BASE_IMAGES=(
  docker.io/library/mariadb:11.4
  docker.io/library/caddy:2.9
  docker.io/library/phpmyadmin:5.2
  docker.io/library/busybox:latest
)

# ── helpers ───────────────────────────────────────────────────────────────────
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
step()   { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

# Rewrite a copied unit/config file in place for this install:
# job suffix on every name, offset ports, and the repo-local .env path.
render_file() {
  local file="$1" name expr=()
  if [ -n "$SFX" ]; then
    for name in "${BASE_NAMES[@]}"; do
      expr+=(-e "s/\\b${name}\\b/${name}${SFX}/g")
    done
  fi
  expr+=(
    -e "s|__REPO_ENV__|$ENV_FILE|g"
    -e "s/^PublishPort=${WEB_PORT_BASE}:${WEB_PORT_BASE}\$/PublishPort=${WEB_PORT}:${WEB_PORT}/"
    -e "s/^PublishPort=${API_PORT_BASE}:${API_PORT_BASE}\$/PublishPort=${API_PORT}:${API_PORT}/"
    -e "s/^PublishPort=${PMA_PORT_BASE}:${PMA_PORT_BASE}\$/PublishPort=${PMA_PORT}:${PMA_PORT}/"
    -e "s/localhost:${WEB_PORT_BASE}\\b/localhost:${WEB_PORT}/g"
    -e "s/localhost:${API_PORT_BASE}\\b/localhost:${API_PORT}/g"
    -e "s/localhost:${PMA_PORT_BASE}\\b/localhost:${PMA_PORT}/g"
  )
  sed -i -E "${expr[@]}" "$file"
}

# Destination path in $SYSTEMD_DIR for a unit from .quadlet/ (suffixed name).
unit_dest() {
  local base
  base="$(basename "$1")"
  printf '%s/%s%s.%s\n' "$SYSTEMD_DIR" "${base%.*}" "$SFX" "${base##*.}"
}

svc() { printf 'api-manager-%s%s.service\n' "$1" "$SFX"; }
