# API Manager

Reverse proxy with HTTPS, access controls, and reporting.

## Usage
See `docs/operations.md` for setup, environment files, ports, seed data, and admin login.



## Structure
- `backend/`: Node.js + TypeScript Fastify API/proxy
- `frontend/`: React admin UI
- `infra/`: Podman Compose + DB init
- `scripts/`: setup/build/rebuild/remove helpers
- `docs/`: plan and operations guides
