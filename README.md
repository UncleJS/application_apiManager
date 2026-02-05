# API Manager

Reverse proxy with HTTPS, access controls, and reporting.

## Usage
See `docs/operations.md` for setup, ports, seed data, and admin login.

Environment file:
- Copy `.env.example` to `.env` and update secrets.
- `live.env` is ignored by git.

### build.sh vs rebuild.sh
- `scripts/build.sh` builds images only; running containers keep using the old image.
- `scripts/rebuild.sh` stops containers, rebuilds images, and starts services again.
- Use `build.sh` when you want images ready but will restart later.
- Use `rebuild.sh` when you need code changes to take effect immediately.
- Neither script removes volumes or deletes data.

### Volume removal safety
- `scripts/remove.sh --purge` only deletes volumes not in use and only used by `api-manager-pod`.
- If compose labels are missing, it only removes volumes with names starting `infra_api-manager-` or `api-manager-`.

### Reports date range
All report endpoints accept optional `from` and `to` query params (ISO date or datetime).
- Example: `/reports/orgs/weekly?from=2025-01-01&to=2026-02-03`
- If omitted, the current week or month is used.



## Structure
- `backend/`: Node.js + TypeScript Fastify API/proxy
- `frontend/`: React admin UI
- `infra/`: Podman Compose + DB init
- `scripts/`: setup/build/rebuild/remove helpers
- `docs/`: plan and operations guides
