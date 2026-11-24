#!/usr/bin/env bash
# common.sh — shared names, ports and helpers for the API Manager scripts.
# Sourced by the other scripts; not meant to be run directly.
#
# Parallel installs: set JOB=<slug> to suffix every Podman/systemd name with
# "-<slug>", and PORT_OFFSET=<n> to add <n> to every published port, e.g.
#   JOB=test PORT_OFFSET=3000 scripts/install.sh
# Without JOB the names are unchanged; PORT_OFFSET defaults to 0.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1
QUADLET_DIR="$ROOT_DIR/quadlet"
SYSTEMD_DIR="$HOME/.config/containers/systemd"
ENV_FILE="$ROOT_DIR/.env"

JOB="${JOB:-}"
PORT_OFFSET="${PORT_OFFSET:-0}"
if [ -n "$JOB" ] && ! [[ "$JOB" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  printf 'JOB must be lowercase letters and digits, joined by single dashes: %s\n' "$JOB" >&2; exit 1
fi
if ! [[ "$PORT_OFFSET" =~ ^[0-9]{1,5}$ ]]; then
  printf 'PORT_OFFSET must be a non-negative integer: %s\n' "$PORT_OFFSET" >&2; exit 1
fi
PORT_OFFSET=$((10#$PORT_OFFSET))
SFX="${JOB:+-$JOB}"

# ── ports ─────────────────────────────────────────────────────────────────────
# Registered range for this repo (00_repoMan). Layout: start+0 web, start+1 API,
# start+2 phpMyAdmin. Caddy listens on the same port inside the pod as on the
# host. Pod-internal: frontend 3000, backend 3001, MariaDB 3306 (never published).
PORT_RANGE=1100-1109
WEB_PORT_BASE=1100
API_PORT_BASE=1101
PMA_PORT_BASE=1102
WEB_PORT=$((WEB_PORT_BASE + PORT_OFFSET))
API_PORT=$((API_PORT_BASE + PORT_OFFSET))
PMA_PORT=$((PMA_PORT_BASE + PORT_OFFSET))
if [ "$PMA_PORT" -gt 65535 ]; then
  printf 'PORT_OFFSET %s pushes ports past 65535\n' "$PORT_OFFSET" >&2; exit 1
fi
FRONTEND_INTERNAL_PORT=3000
BACKEND_INTERNAL_PORT=3001

# ── names ─────────────────────────────────────────────────────────────────────
# Base names as they appear in quadlet/ and the image tags; each gets $SFX.
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
# Volumes as named in quadlet/ (Quadlet creates them as systemd-<name>).
VOLUMES=(
  "api-manager-db$SFX"
  "api-manager-tls$SFX"
  "api-manager-jwt$SFX"
  "api-manager-caddy-config$SFX"
  "api-manager-caddy-data$SFX"
)
CADDY_CONFIG_VOLUME="systemd-api-manager-caddy-config$SFX"
# Label put on every image (and build layer) the repo builds.
IMAGE_LABEL="app=api-manager$SFX"
# Third-party images pulled for this repo (runtime units, install, Containerfiles).
BASE_IMAGES=(
  docker.io/oven/bun:1-alpine
  docker.io/oven/bun:1.2.15
  docker.io/library/mariadb:11.4
  docker.io/library/caddy:2.9
  docker.io/library/phpmyadmin:5.2
  docker.io/library/busybox:latest
)

# The repo creates no Podman networks (the pod uses the default network) and
# no Podman secrets (credentials come from the repo-local .env). Listed so
# uninstall.sh removes and checks them if that ever changes.
NETWORKS=()
SECRETS=()
# Every container this install's units and scripts name (incl. the pod infra).
all_containers() {
  printf '%s\n' "$CTR_EDGE" "$CTR_FRONTEND" "$CTR_BACKEND" "$CTR_PHPMYADMIN" "$CTR_MARIADB" "$CTR_DEV" "$POD_NAME-infra"
}

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
  # Ports go through placeholders first so a shifted port is never matched
  # again by the next rule (e.g. PORT_OFFSET=1 would turn 1100 into 1101).
  local base port tag
  expr+=(-e "s|__REPO_ENV__|$ENV_FILE|g")
  for tag in WEB API PMA; do
    base="${tag}_PORT_BASE"; base="${!base}"
    expr+=(
      -e "s/^PublishPort=${base}:${base}\$/PublishPort=@@${tag}@@:@@${tag}@@/"
      -e "s/localhost:${base}\\b/localhost:@@${tag}@@/g"
    )
  done
  for tag in WEB API PMA; do
    port="${tag}_PORT"; port="${!port}"
    expr+=(-e "s/@@${tag}@@/${port}/g")
  done
  sed -i -E "${expr[@]}" "$file"
}

# Destination path in $SYSTEMD_DIR for a unit from quadlet/ (suffixed name).
unit_dest() {
  local base
  base="$(basename "$1")"
  printf '%s/%s%s.%s\n' "$SYSTEMD_DIR" "${base%.*}" "$SFX" "${base##*.}"
}

svc() { printf 'api-manager-%s%s.service\n' "$1" "$SFX"; }

# Every systemd service this install's units generate (exact names).
all_services() {
  local s v
  for s in edge frontend backend phpmyadmin mariadb dev; do svc "$s"; done
  printf '%s\n' "$POD_SERVICE"
  for v in "${VOLUMES[@]}"; do printf '%s-volume.service\n' "$v"; done
}
