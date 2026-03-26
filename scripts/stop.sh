#!/usr/bin/env bash
# stop.sh — stop all API Manager services
set -euo pipefail

printf '\033[1;36m▶ Stopping api-manager services...\033[0m\n'
systemctl --user stop api-manager-edge.service api-manager-phpmyadmin.service api-manager-frontend.service api-manager-backend.service api-manager-mariadb.service api-manager-dev.service || true
systemctl --user stop api-manager-pod-pod.service || true
printf '\033[0;32mStopped.\033[0m\n'
