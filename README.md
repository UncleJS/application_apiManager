# API Manager

Reverse proxy with HTTPS, access controls, and reporting.

## Usage
See `docs/operations.md` for setup, ports, seed data, and admin login.

### build.sh vs rebuild.sh
- `scripts/build.sh` builds images only; running containers keep using the old image.
- `scripts/rebuild.sh` stops containers, rebuilds images, and starts services again.
- Use `build.sh` when you want images ready but will restart later.
- Use `rebuild.sh` when you need code changes to take effect immediately.
- Neither script removes volumes or deletes data.

## Structure
- `backend/`: Node.js + TypeScript Fastify API/proxy
- `frontend/`: React admin UI
- `infra/`: Podman Compose + DB init
- `scripts/`: setup/build/rebuild/remove helpers
- `docs/`: plan and operations guides
