#!/usr/bin/env bash
# uninstall.sh — stop API Manager and remove everything it created to build and run.
#
# Default: stops the services and clears failed units, removes the containers
# (incl. build and one-shot containers), the pod and its infra container, the
# images the repo built plus their labelled build layers, the third-party base
# images unless something else still uses them, any networks/secrets the repo
# created, and leftover state files. Named volumes and Quadlet units are kept.
#   --purge            also delete the named volumes (without JOB: type YES to confirm)
#   --remove-quadlets  also delete the Quadlet units from ~/.config/containers/systemd
# Finally it checks for leftovers, filtered to this install's exact names, and
# exits non-zero if anything that should be gone is still there.
#
# Without JOB this acts on the main install; with JOB=<slug> only on that job's
# suffixed set (and --purge does not prompt).
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
      printf 'Stops API Manager and removes its services, containers, pod, built images,\n'
      printf 'build layers, unused base images and leftover state. Keeps volumes and\n'
      printf 'Quadlet units unless asked:\n'
      printf '  --purge             Also delete the named volumes and their data\n'
      printf '                      (main install: asks you to type YES)\n'
      printf '  --remove-quadlets   Also remove the Quadlet units and run daemon-reload\n'
      printf 'Env: JOB=<slug> acts only on that job install (no prompt for --purge).\n'
      printf 'Exits non-zero if leftovers remain after removal.\n'
      exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$arg" >&2; exit 1 ;;
  esac
done

TARGET="${JOB:+job $JOB}"
TARGET="${TARGET:-main install}"

# Confirm a main-install purge up front, before anything is removed.
if [ "$PURGE" = "true" ] && [ -z "$JOB" ]; then
  yellow "WARNING: --purge permanently deletes all database data, TLS and JWT keys."
  printf 'Type YES to confirm: '
  confirm=""
  read -r confirm || true
  if [ "$confirm" != "YES" ]; then
    red "Purge not confirmed; nothing was removed. Re-run without --purge to keep the data."
    exit 1
  fi
fi

if ! systemctl --user show-environment >/dev/null 2>&1; then
  red "ERROR: no systemd user session (is XDG_RUNTIME_DIR set?); nothing was removed."
  exit 1
fi

mapfile -t services < <(all_services)
# Oneshot service of the dev volume unit that older installs wrote.
services+=("api-manager-dev$SFX-volume.service")
mapfile -t containers < <(all_containers)
repo_images=("$IMAGE_BACKEND" "$IMAGE_FRONTEND" "$IMAGE_DEV")
# Volumes as Quadlet names them (systemd-<name>) and as install.sh creates them,
# plus the dev volume older installs created.
vol_names=()
for v in "${VOLUMES[@]}" "api-manager-dev$SFX"; do vol_names+=("$v" "systemd-$v"); done
# Quadlet units this install may have written (plus the stale dev volume unit).
units=()
for unit in "$QUADLET_DIR"/*; do units+=("$(unit_dest "$unit")"); done
units+=("$SYSTEMD_DIR/api-manager-dev$SFX.volume")
# Legacy host copy of the env file written by older installs.
state_files=("$SYSTEMD_DIR/api-manager$SFX.env")

# Print the lines of stdin that exactly match one of the arguments.
only() { grep -Fx -f <(printf '%s\n' "$@") || true; }
# Join stdin lines with spaces.
words() { tr '\n' ' ' | sed 's/ *$//'; }
# IDs of containers (incl. external build containers) from this repo's images.
repo_container_ids() {
  {
    podman ps -a --external -q --filter "label=$IMAGE_LABEL"
    for img in "${repo_images[@]}"; do
      if podman image exists "$img"; then podman ps -a --external -q --filter "ancestor=$img"; fi
    done
  } | sort -u
}

# ── services ──────────────────────────────────────────────────────────────────
step "Stopping $TARGET services"
for s in "${services[@]}"; do
  systemctl --user stop "$s" 2>/dev/null || true
done

# ── containers and pod ────────────────────────────────────────────────────────
step "Removing $TARGET containers and pod"
for c in "${containers[@]}"; do
  if podman container exists "$c"; then podman rm -f "$c" >/dev/null && green "  removed container $c"; fi
done
mapfile -t extra < <(repo_container_ids)
for id in "${extra[@]}"; do
  if [ -n "$id" ] && podman rm -f "$id" >/dev/null 2>&1; then green "  removed container $id"; fi
done
if podman pod exists "$POD_NAME"; then podman pod rm -f "$POD_NAME" >/dev/null && green "  removed pod $POD_NAME"; fi

# ── images ────────────────────────────────────────────────────────────────────
step "Removing images built by the repo"
# Parent layer images of the repo images, recorded before the tags go: images
# built before build.sh labelled its layers have unlabelled intermediates.
mapfile -t parents < <(for img in "${repo_images[@]}"; do
  if podman image exists "$img"; then podman history -q --no-trunc "$img" | grep -v '<missing>' || true; fi
done | sort -u)
for img in "${repo_images[@]}"; do
  if podman image exists "$img"; then podman rmi -f "$img" >/dev/null && green "  removed image $img"; fi
done
# Untagged parents only; a tagged parent is a base image, handled below. Removal
# without -f fails while another image still builds on the layer, which keeps it.
removed=0
for id in ${parents[@]+"${parents[@]}"}; do
  podman image exists "$id" || continue
  [ -z "$(podman image inspect --format '{{join .RepoTags " "}}' "$id" 2>/dev/null)" ] || continue
  if podman rmi "$id" >/dev/null 2>&1; then removed=$((removed + 1)); fi
done
if [ "$removed" -gt 0 ]; then green "  removed $removed unlabelled parent layer image(s)"; fi
# Intermediate and dangling layers: build.sh and dev.sh label every layer image.
mapfile -t layers < <(podman images -a -q --filter "label=$IMAGE_LABEL" | sort -u)
if [ "${#layers[@]}" -gt 0 ]; then
  podman rmi -f "${layers[@]}" >/dev/null 2>&1 || true
  still="$(podman images -a -q --filter "label=$IMAGE_LABEL" | sort -u | wc -l)"
  green "  removed $(( ${#layers[@]} - still )) of ${#layers[@]} labelled build layer image(s)"
fi
podman image prune -f --filter "label=$IMAGE_LABEL" >/dev/null 2>&1 || true
green "  no RUN cache mounts are used, so there is no separate build cache to clear"

step "Removing third-party base images not used elsewhere"
for img in "${BASE_IMAGES[@]}"; do
  podman image exists "$img" || continue
  users="$(podman ps -a -q --filter "ancestor=$img" | words)"
  if [ -n "$users" ]; then
    yellow "  kept $img: used by container(s) $users"
    continue
  fi
  # Other Quadlet units (other installs or repos, any unit type) that still use
  # this image, by full or short name.
  short="${img#docker.io/}"; short="${short#library/}"
  pat="^[[:space:]]*Image[[:space:]]*=[[:space:]]*(docker\.io/)?(library/)?${short//./\\.}[[:space:]]*\$"
  refs="$(grep -rlsE "$pat" "$SYSTEMD_DIR" 2>/dev/null \
    | grep -vFx -f <(printf '%s\n' "${units[@]}") | xargs -r -n1 basename | words || true)"
  if [ -n "$refs" ]; then
    yellow "  kept $img: referenced by other Quadlet unit(s) $refs"
    continue
  fi
  if podman rmi "$img" >/dev/null 2>&1; then
    green "  removed image $img"
  else
    yellow "  kept $img: still needed by another image"
  fi
done

# Rootless podman builds localhost/podman-pause:<ver> for pod infra containers.
# Remove it only when no pod at all is left (any repo); podman rebuilds it.
mapfile -t pause_imgs < <(podman images --format '{{.Repository}}:{{.Tag}}' | grep '^localhost/podman-pause:' || true)
if [ "${#pause_imgs[@]}" -gt 0 ]; then
  if [ -n "$(podman pod ls -q)" ]; then
    yellow "  kept ${pause_imgs[*]}: other pods still exist"
  else
    for img in "${pause_imgs[@]}"; do
      if podman rmi "$img" >/dev/null 2>&1; then green "  removed image $img"; else yellow "  kept $img: still in use"; fi
    done
  fi
fi

# ── networks, secrets, state files ────────────────────────────────────────────
step "Removing networks, secrets and state files"
for n in ${NETWORKS[@]+"${NETWORKS[@]}"}; do
  if podman network exists "$n"; then podman network rm -f "$n" >/dev/null && green "  removed network $n"; fi
done
for s in ${SECRETS[@]+"${SECRETS[@]}"}; do
  if podman secret exists "$s"; then podman secret rm "$s" >/dev/null && green "  removed secret $s"; fi
done
for f in "${state_files[@]}"; do
  if [ -e "$f" ]; then rm -f "$f" && green "  removed $f"; fi
done
green "  the repo creates no networks or secrets; .env stays in the repo checkout"

# ── volumes ───────────────────────────────────────────────────────────────────
if [ "$PURGE" = "true" ]; then
  step "Purging $TARGET volumes"
  for vol in "${vol_names[@]}"; do
    if podman volume exists "$vol"; then
      if podman volume rm -f "$vol" >/dev/null; then green "  removed volume $vol"; else red "  FAILED to remove volume $vol"; fi
    fi
  done
fi

# ── Quadlet units ─────────────────────────────────────────────────────────────
if [ "$REMOVE_QUADLETS" = "true" ]; then
  step "Removing $TARGET Quadlet units from $SYSTEMD_DIR"
  for u in "${units[@]}"; do
    if [ -f "$u" ]; then rm -f "$u" && green "  removed $(basename "$u")"; fi
  done
  systemctl --user daemon-reload
fi
for s in "${services[@]}"; do
  systemctl --user reset-failed "$s" 2>/dev/null || true
done

# ── leftover check ────────────────────────────────────────────────────────────
step "Checking for $TARGET leftovers"
left=0
report() { if [ -n "$2" ]; then red "  $1: $2"; left=1; fi; }
list_units() { systemctl --user list-units --all --plain --no-legend 'api-manager-*' 2>/dev/null || true; }
report containers "$( { podman ps -a --external --format '{{.Names}}' | only "${containers[@]}"; repo_container_ids; } | words)"
report pods "$(podman pod ls --format '{{.Name}}' | only "$POD_NAME" | words)"
report images "$(podman images --format '{{.Repository}}:{{.Tag}}' | only "${repo_images[@]}" | words)"
report "labelled images" "$(podman images -a -q --filter "label=$IMAGE_LABEL" | sort -u | words)"
if [ "${#NETWORKS[@]}" -gt 0 ]; then
  report networks "$(podman network ls --format '{{.Name}}' | only "${NETWORKS[@]}" | words)"
fi
if [ "${#SECRETS[@]}" -gt 0 ]; then
  report secrets "$(podman secret ls --format '{{.Name}}' | only "${SECRETS[@]}" | words)"
fi
report "state files" "$(for f in "${state_files[@]}"; do if [ -e "$f" ]; then printf '%s\n' "$f"; fi; done | words)"
report "running or failed services" "$(list_units | awk '$3 == "active" || $3 == "failed" {print $1}' | only "${services[@]}" | words)"

present_vols="$(podman volume ls --format '{{.Name}}' | only "${vol_names[@]}" | words)"
present_units="$(for u in "${units[@]}"; do if [ -e "$u" ]; then basename "$u"; fi; done | words)"
if [ "$PURGE" = "true" ]; then
  report volumes "$present_vols"
elif [ -n "$present_vols" ]; then
  yellow "  kept volumes (use --purge to delete): $present_vols"
fi
if [ "$REMOVE_QUADLETS" = "true" ]; then
  report units "$present_units"
  report "systemd units" "$(list_units | awk '{print $1}' | only "${services[@]}" | words)"
elif [ -n "$present_units" ]; then
  yellow "  kept Quadlet units (use --remove-quadlets to delete): $present_units"
fi
# Working containers of an interrupted build carry no repo label; list them so
# they can be checked by hand (they may belong to another repo's build).
builders="$(podman ps -a --external --format '{{.Names}}' | grep -E '(bun|working-container)' | grep -vFx -f <(podman ps -a --format '{{.Names}}') | words || true)"
if [ -n "$builders" ]; then yellow "  build containers not owned by a pod (check by hand): $builders"; fi
if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null || true)" = "yes" ]; then
  yellow "  systemd linger is enabled for $USER (install.sh --enable-linger sets it); left as is, other services may need it."
  yellow "  If nothing else does: loginctl disable-linger $USER"
fi
# Builds from before build.sh labelled every layer can leave unlabelled
# build-stage images (<none>) that cannot be tied to this repo safely.
dangling="$(podman images -a -q --filter dangling=true | sort -u | wc -l)"
if [ "$dangling" -gt 0 ]; then
  yellow "  $dangling untagged image(s) without a repo label remain (may include stages of"
  yellow "  older unlabelled builds, or other repos'); review with: podman images -a --filter dangling=true"
fi
kept_base="$(podman images --format '{{.Repository}}:{{.Tag}}' | only "${BASE_IMAGES[@]}" | words)"
if [ -n "$kept_base" ]; then yellow "  shared base images still present (see above): $kept_base"; fi

if [ "$left" -ne 0 ]; then
  red "Leftovers found for $TARGET."
  exit 1
fi
green ""
green "API Manager ($TARGET) uninstalled; nothing left that should be gone."
