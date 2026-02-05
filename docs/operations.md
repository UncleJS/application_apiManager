# Operations Guide

## Quickstart (Podman Compose)
1. Build images:
   - `scripts/build.sh`
2. Start services (creates pod if missing):
   - `scripts/setup.sh`
   - If you created the pod before updating scripts, run `scripts/remove.sh` and re-run setup.
3. After code changes, use:
   - `scripts/rebuild.sh`
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
  - This can take a few minutes; progress logs print every 10k rows.
  - If access logs already exist, setup skips access log seeding.

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
  - Only removes volumes not in use and only used by `api-manager-pod`.
  - If compose labels are missing, it only removes volumes whose names start with `infra_api-manager-` or `api-manager-`.

## Environment variables
Create a `.env` file at repo root (see `.env.example`).

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
- `DB_HOST` (default 127.0.0.1)

Frontend:
- `VITE_API_BASE_URL` (default https://localhost:55001)

## Ports
- Frontend: 55000
- Backend HTTPS: 55001
- phpMyAdmin: 55002
- MariaDB: internal only

## Reverse proxy usage
Requests to the backend HTTPS port are routed by longest-prefix match on `base_path`.
The suffix after `base_path` is appended to `target_url`.

Example 1 (simple passthrough):
- base_path: `/acme/orders`
- target_url: `https://example.com/acme/orders`

Request:
- `https://localhost:55001/acme/orders/123?status=open`

Upstream:
- `https://example.com/acme/orders/123?status=open`

Example 2 (different upstream root):
- base_path: `/globex/billing`
- target_url: `https://api.globex.com/v2`

Request:
- `https://localhost:55001/globex/billing/invoices/55`

Upstream:
- `https://api.globex.com/v2/invoices/55`

Example 3 (public API, no auth):
```
curl -k https://localhost:55001/global/public/ping
```

Example 4 (restricted API, JWT required):
```
TOKEN=$(curl -k -s https://localhost:55001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"global-admin","password":"001002..Ad"}' | \
  python - <<'PY'
import sys, json
print(json.load(sys.stdin)["token"])
PY
)

curl -k https://localhost:55001/acme/orders/123 \
  -H "Authorization: Bearer $TOKEN"
```

Notes:
- The API must be enabled and within its allowed hours (unless global admin).
- Users can only access APIs in their org that are assigned to them.

## Reports date range
All report endpoints accept optional `from` and `to` query params (ISO date or datetime).
- Example: `/reports/orgs/weekly?from=2025-01-01&to=2026-02-03`
- If omitted, the current week or month is used.
- The UI date picker fills `YYYY-MM-DD` and the text input keeps that format.

## Access windows schema note
`access_windows` table in the DB does not have foreign keys because it is a polymorphic table:
- `subject_type` is `user` or `api`
- `subject_id` points to either `users.id` or `api_definitions.id`
MariaDB cannot enforce a single FK across multiple tables, so validation is handled in the app.

## TLS
- TLS cert/key are generated on first backend start and stored in the `api-manager-tls` volume.
