#!/usr/bin/env bash
# start.sh — start all API Manager services via the pod unit
set -euo pipefail

printf '\033[1;36m▶ Starting api-manager services...\033[0m\n'
systemctl --user start api-manager-pod-pod.service
systemctl --user start api-manager-mariadb.service api-manager-backend.service api-manager-frontend.service api-manager-phpmyadmin.service api-manager-edge.service
printf '\033[0;32mStarted. Endpoints:\033[0m\n'
printf '  Frontend:   https://localhost:55000\n'
printf '  Backend:    https://localhost:55001\n'
printf '  phpMyAdmin: https://localhost:55002\n'
printf '  API Docs:   https://localhost:55001/docs\n'
