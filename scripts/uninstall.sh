#!/usr/bin/env bash
# uninstall.sh — stop, disable, and remove API Manager systemd units.
# Use --purge to also delete named volumes (irreversible).
#
# With JOB=<slug> set, only that job's set is touched: services, containers,
# pod, job images and leftover state are removed; volumes only with --purge
# (no prompt) and Quadlet units only with --remove-quadlets. Then it checks for
# leftovers with the job suffix and exits non-zero if any remain.
set -euo pipefail
# shellcheck source=scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
PURGE=false
REMOVE_QUADLETS=false

for arg in "$@"; do
  case "$arg" in
    --purge) PURGE=true ;;
    --remove-quadlets) REMOVE_QUADLETS=true ;;
    -h|--help)
      printf 'Usage: %s [--purge] [--remove-quadlets]\n' "$(basename "$0")"
      printf '  --purge             Also delete the named volumes and their data\n'
      printf '  --remove-quadlets   (JOB mode) also remove the job'"'"'s Quadlet units\n'
      printf 'Without JOB, unit files are always removed (legacy behaviour).\n'
      exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$arg" >&2; exit 1 ;;
  esac
done

if [ -n "$JOB" ]; then
  step "Stopping job $JOB services"
  mapfile -t services < <(all_services)
  for s in "${services[@]}"; do
    systemctl --user stop "$s" 2>/dev/null || true
  done

  step "Removing job containers, pod and images"
  for c in "$CTR_EDGE" "$CTR_FRONTEND" "$CTR_BACKEND" "$CTR_PHPMYADMIN" "$CTR_MARIADB" "$CTR_DEV"; do
    podman rm -f --ignore "$c" >/dev/null || true
  done
  podman pod rm -f --ignore "$POD_NAME" >/dev/null
  for img in "$IMAGE_BACKEND" "$IMAGE_FRONTEND" "$IMAGE_DEV"; do
    if podman image exists "$img"; then podman rmi -f "$img" >/dev/null && green "  removed image $img"; fi
  done
  podman image prune -f --filter "label=app=api-manager$SFX" >/dev/null || true
  yellow "  Base images (${BASE_IMAGES[*]}) are shared with the main install; kept."

  if [ "$PURGE" = "true" ]; then
    step "Purging job volumes"
    for v in "${VOLUMES[@]}"; do
      for vol in "$v" "systemd-$v"; do
        if podman volume exists "$vol"; then podman volume rm -f "$vol" >/dev/null && green "  removed volume $vol"; fi
      done
    done
  else
    yellow "  Volumes kept (use --purge to delete them)."
  fi

  units=()
  for unit in "$QUADLET_DIR"/*; do units+=("$(unit_dest "$unit")"); done
  if [ "$REMOVE_QUADLETS" = "true" ]; then
    step "Removing job Quadlet units"
    for u in "${units[@]}"; do
      if [ -f "$u" ]; then rm -f "$u" && green "  removed $(basename "$u")"; fi
    done
    systemctl --user daemon-reload
  else
    yellow "  Quadlet units kept (use --remove-quadlets to delete them)."
  fi
  for s in "${services[@]}"; do
    systemctl --user reset-failed "$s" 2>/dev/null || true
  done

  step "Checking for leftovers with suffix $SFX"
  left=0
  report() { if [ -n "$2" ]; then red "  $1: $2"; left=1; fi; }
  only() { grep -Fx -f <(printf '%s\n' "$@") | tr '\n' ' ' || true; }
  report containers "$(podman ps -a --format '{{.Names}}' | only "$CTR_EDGE" "$CTR_FRONTEND" "$CTR_BACKEND" "$CTR_PHPMYADMIN" "$CTR_MARIADB" "$CTR_DEV" "$POD_NAME-infra")"
  report pods "$(podman pod ls --format '{{.Name}}' | only "$POD_NAME")"
  report images "$(podman images --format '{{.Repository}}:{{.Tag}}' | only "$IMAGE_BACKEND" "$IMAGE_FRONTEND" "$IMAGE_DEV")"
  report "labelled images" "$(podman images -q --filter "label=app=api-manager$SFX" | tr '\n' ' ')"
  if [ "$PURGE" = "true" ]; then
    vol_names=()
    for v in "${VOLUMES[@]}"; do vol_names+=("$v" "systemd-$v"); done
    report volumes "$(podman volume ls --format '{{.Name}}' | only "${vol_names[@]}")"
  fi
  if [ "$REMOVE_QUADLETS" = "true" ]; then
    report units "$(for u in "${units[@]}"; do [ -e "$u" ] && basename "$u"; done | tr '\n' ' ' || true)"
    report "systemd units" "$(systemctl --user list-units --all --plain --no-legend 'api-manager-*' | awk '{print $1}' | only "${services[@]}")"
  fi
  if [ "$left" -ne 0 ]; then red "Leftovers found for job $JOB."; exit 1; fi
  green "Job $JOB uninstalled; nothing left."
  exit 0
fi

# ── stop pod ──────────────────────────────────────────────────────────────────
step "Stopping api-manager-pod"
systemctl --user stop api-manager-pod-pod.service 2>/dev/null || true

# ── stop individual services (belt + braces) ──────────────────────────────────
for svc in api-manager-edge api-manager-frontend api-manager-backend api-manager-phpmyadmin api-manager-mariadb api-manager-dev; do
  systemctl --user stop "${svc}.service" 2>/dev/null || true
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
green "  Quadlet install state is removed by deleting source unit files"

# ── purge volumes ─────────────────────────────────────────────────────────────
if [ "$PURGE" = "true" ]; then
  step "Purging named volumes (--purge specified)"
  yellow "WARNING: This will permanently delete all database data and TLS keys."
  printf 'Type YES to confirm: '
  read -r confirm
  if [ "$confirm" = "YES" ]; then
    base_volumes=(
      api-manager-db
      api-manager-tls
      api-manager-jwt
      api-manager-caddy-config
      api-manager-caddy-data
      api-manager-dev
    )
    candidate_volumes=()

    for base_vol in "${base_volumes[@]}"; do
      for vol in "$base_vol" "systemd-$base_vol"; do
        if podman volume inspect "$vol" >/dev/null 2>&1; then
          candidate_volumes+=("$vol")
        fi
      done
    done

    if [ "${#candidate_volumes[@]}" -eq 0 ]; then
      yellow "  no api-manager volumes found, skipping"
    else
      for vol in "${candidate_volumes[@]}"; do
        if podman volume rm --force "$vol" 2>/dev/null; then
          green "  removed volume $vol"
        else
          red "  FAILED to remove volume $vol (still in use?)"
        fi
      done
    fi
  else
    yellow "  Purge skipped (confirmation not given)"
  fi
fi

green ""
green "API Manager uninstalled."
if [ "$PURGE" != "true" ]; then
  yellow "Named volumes retained. Re-run with --purge to delete data."
fi
