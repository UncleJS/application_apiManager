#!/usr/bin/env bash
# uninstall.sh — stop, disable, and remove API Manager systemd units.
# Use --purge to also delete named volumes (irreversible).
set -euo pipefail

SYSTEMD_DIR="$HOME/.config/containers/systemd"
PURGE=false

for arg in "$@"; do
  case "$arg" in
    --purge) PURGE=true ;;
    *) printf 'Unknown argument: %s\n' "$arg" >&2; exit 1 ;;
  esac
done

green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
step()   { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

# ── stop pod ──────────────────────────────────────────────────────────────────
step "Stopping api-manager-pod"
systemctl --user stop api-manager-pod-pod.service 2>/dev/null || true

# ── stop individual services (belt + braces) ──────────────────────────────────
for svc in api-manager-edge api-manager-frontend api-manager-backend api-manager-phpmyadmin api-manager-mariadb api-manager-dev; do
  systemctl --user stop "${svc}.service" 2>/dev/null || true
done

# ── disable services ──────────────────────────────────────────────────────────
step "Disabling services"
for svc in api-manager-pod-pod api-manager-mariadb api-manager-backend api-manager-frontend api-manager-phpmyadmin api-manager-edge api-manager-dev; do
  systemctl --user disable "${svc}.service" 2>/dev/null || true
  green "  disabled ${svc}"
done

# ── remove unit files ─────────────────────────────────────────────────────────
step "Removing Quadlet unit files from $SYSTEMD_DIR"
for pattern in \
  api-manager-pod.pod \
  api-manager-db.volume \
  api-manager-tls.volume \
  api-manager-jwt.volume \
  api-manager-caddy-config.volume \
  api-manager-caddy-data.volume \
  api-manager-dev.volume \
  api-manager-mariadb.container \
  api-manager-backend.container \
  api-manager-frontend.container \
  api-manager-phpmyadmin.container \
  api-manager-edge.container \
  api-manager-dev.container \
  api-manager.env; do
  target="$SYSTEMD_DIR/$pattern"
  if [ -f "$target" ]; then
    rm -f "$target"
    green "  removed $pattern"
  fi
done

systemctl --user daemon-reload
green "  daemon-reload done"

# ── purge volumes ─────────────────────────────────────────────────────────────
if [ "$PURGE" = "true" ]; then
  step "Purging named volumes (--purge specified)"
  yellow "WARNING: This will permanently delete all database data and TLS keys."
  printf 'Type YES to confirm: '
  read -r confirm
  if [ "$confirm" = "YES" ]; then
    for vol in api-manager-db api-manager-tls api-manager-jwt api-manager-caddy-config api-manager-caddy-data api-manager-dev; do
      if podman volume inspect "$vol" >/dev/null 2>&1; then
        if podman volume rm --force "$vol" 2>/dev/null; then
          green "  removed volume $vol"
        else
          red "  FAILED to remove volume $vol (still in use?)"
        fi
      else
        yellow "  volume $vol not found, skipping"
      fi
    done
  else
    yellow "  Purge skipped (confirmation not given)"
  fi
fi

green ""
green "API Manager uninstalled."
if [ "$PURGE" != "true" ]; then
  yellow "Named volumes retained. Re-run with --purge to delete data."
fi
