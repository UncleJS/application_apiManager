# Operations Guide

## Quickstart (Podman Compose)
1. Build images:
   - `scripts/build.sh`
2. Start services (creates pod if missing):
   - `scripts/setup.sh`
   - If you created the pod before updating scripts, run `scripts/remove.sh` and re-run setup.
3. Open the UI:
   - Frontend: `https://localhost:55000`
   - Backend (API + proxy): `https://localhost:55001`
   - phpMyAdmin: `http://localhost:55002`

Notes:
- The backend uses a self-signed cert; your browser will show a warning.
- Visit `https://localhost:55001` once and accept the cert so the frontend can call the API.
- `https://localhost:55001/healthz` returns a simple health response.
- MariaDB has no host port; it is only reachable inside the pod.

## Seed data (dev/test)
Enable dev/test seed data on startup:
- `SEED_DATA=true scripts/setup.sh`

Enable access log seed generation (250k rows for 2025-01-01 to 2026-02-03):
- `SEED_DATA=true SEED_ACCESS_LOGS=true scripts/setup.sh`
  - This can take a few minutes.

## Default admin (dev/test)
- Username: `global-admin`
- Password: `001002..Ad`

## Rebuild / remove
### build.sh vs rebuild.sh
- `scripts/build.sh` builds images only; running containers keep using the old image.
- `scripts/rebuild.sh` stops containers, rebuilds images, and starts services again.
- Use `build.sh` when you want images ready but will restart later.
- Use `rebuild.sh` when you need code changes to take effect immediately.
- Neither script removes volumes or deletes data.

- Rebuild containers: `scripts/rebuild.sh`
- Remove containers (keep volumes): `scripts/remove.sh`
- Remove containers + volumes: `scripts/remove.sh --purge`

## Environment variables
Backend (set in `infra/podman-compose.yml`):
- `PORT` (default 55001)
- `DB_HOST` (default 127.0.0.1)
- `DB_PORT` (default 3306)
- `DB_USER` (default api_manager)
- `DB_PASSWORD` (default api_manager_password)
- `DB_DATABASE` (default api_manager)
- `JWT_SECRET_PATH` (default /data/jwt/secret)
- `TLS_CERT_PATH` (default /data/tls/cert.pem)
- `TLS_KEY_PATH` (default /data/tls/key.pem)
- `BOOTSTRAP_ADMIN` (default true)
- `BOOTSTRAP_ADMIN_PASSWORD` (default 001002..Ad)
- `SEED_DATA` (default false)
- `SEED_ACCESS_LOGS` (default false)
- `CORS_ORIGIN` (default http://localhost:55000)

Setup script:
- `DB_ROOT_PASSWORD` (default root_password)

Frontend:
- `VITE_API_BASE_URL` (default https://localhost:55001)

## Ports
- Frontend: 55000
- Backend HTTPS: 55001
- phpMyAdmin: 55002
- MariaDB: internal only

## TLS
- TLS cert/key are generated on first backend start and stored in the `api-manager-tls` volume.
