# AGENTS

This file guides automated coding agents working in this repository.
If guidance here conflicts with existing project conventions, follow the project.

## Repository status
- Node.js + TypeScript backend in `backend/`.
- React + Vite frontend in `frontend/`.
- Podman Compose + DB init SQL in `infra/`.
- Scripts in `scripts/`.
- phpMyAdmin served over HTTPS via Caddy (`infra/phpmyadmin/Caddyfile`).
- Auth uses DB-backed sessions with cookie `api_manager_session`.
- No Cursor or Copilot rules were found (`.cursor/rules/`, `.cursorrules`, `.github/copilot-instructions.md`).

## Build, lint, and test commands

### Backend (`backend/`)
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Start: `npm run start`
- Lint: `npm run lint`
- Seed (dev/test): `npm run seed`

### Frontend (`frontend/`)
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`
- Lint: `npm run lint`

### Podman scripts
- Setup: `scripts/setup.sh`
- Build: `scripts/build.sh`
- Rebuild: `scripts/rebuild.sh`
- Remove: `scripts/remove.sh` (use `--purge` to delete volumes)
- Scripts load `.env` automatically; copy `.env.example` to `.env`.
- Use `scripts/rebuild.sh` after code changes to restart services.
- `remove.sh --purge` only deletes volumes not in use and scoped to `api-manager-pod`.
- Container names are explicit (no `_1` suffix), e.g., `api-manager-backend`, `api-manager-mariadb`.

### Tests
- No automated tests configured yet.

### Health checks
- Healthchecks are configured in `infra/podman-compose.yml` for DB, backend, and frontend.

### Reports
- Report endpoints accept optional `from` and `to` query params (ISO date or datetime).

### Common single-test patterns (use only if repo matches)
- JavaScript/TypeScript (Jest): `npx jest <testNameOrPath>` or `npm test -- <pattern>`.
- JavaScript/TypeScript (Vitest): `npx vitest <testNameOrPath>` or `npm test -- <pattern>`.
- JavaScript/TypeScript (Mocha): `npx mocha <file> --grep <pattern>`.
- Python (pytest): `pytest <path> -k <pattern>`.
- Go: `go test ./path/to/pkg -run <TestName>`.
- Rust (cargo): `cargo test <test_name>`.
- Java (Gradle): `./gradlew test --tests <TestClass.testMethod>`.
- Java (Maven/Surefire): `mvn -Dtest=ClassName#testMethod test`.
- Ruby (RSpec): `bundle exec rspec <file>:<line>`.
- PHP (PHPUnit): `vendor/bin/phpunit --filter <pattern> <file>`.
- .NET (xUnit/NUnit/MSTest): `dotnet test --filter <expression>`.

### Recommended canonical commands
- Backend build: `npm run build` (from `backend/`)
- Backend lint: `npm run lint` (from `backend/`)
- Frontend build: `npm run build` (from `frontend/`)
- Frontend lint: `npm run lint` (from `frontend/`)
- No formatter/test commands yet

## Code style guidelines
- Follow existing conventions in the repo; if none exist, use the defaults below.
- Keep changes minimal and localized; avoid stylistic churn.
- Use ASCII unless the file already contains Unicode.

### Formatting
- Indentation: spaces, not tabs; use language formatter defaults.
- Line length: aim for 100–120 characters unless tooling enforces otherwise.
- One logical statement per line; wrap long conditionals for readability.
- Keep blank lines meaningful; avoid multiple consecutive blank lines.
- Prefer formatters (Prettier/Black/gofmt) over manual alignment.

### Imports
- Order imports: standard library, third-party, then local.
- Group imports with a single blank line between groups.
- Avoid unused imports; remove them immediately.
- Prefer named imports over deep relative paths.
- Do not introduce circular dependencies.

### Naming conventions
- Variables/functions: `camelCase` for JS/TS, `snake_case` for Python; follow language norms.
- Types/classes/components: `PascalCase`.
- Constants: `SCREAMING_SNAKE_CASE` when truly constant.
- Files/directories: `kebab-case` for non-component files; React components use `PascalCase.tsx`.
- Exception: follow language conventions (e.g., Python modules `snake_case`, Go files `snake_case`).
- Tests: name files to mirror the unit under test, e.g., `foo.test.ts` or `test_foo.py`.

### Types and interfaces
- Prefer explicit types at module boundaries and public APIs.
- Use type inference for obvious local variables.
- Avoid `any`/`object`/`interface{}` unless there is no alternative.
- Keep types close to usage; export only what is needed.
- For JSON parsing, validate and narrow types before use.

### Error handling
- Fail fast on invalid inputs at boundaries (API, CLI, file IO).
- Include context in errors: what failed and the relevant identifier.
- Do not swallow errors; handle or propagate with a clear message.
- Prefer typed errors/exceptions where the language supports it.
- Avoid broad `catch` that hides failures; log and rethrow or return.

### Logging
- Log at appropriate levels (debug/info/warn/error).
- Avoid logging secrets or PII.
- Use structured logs when possible (key/value).

### Tests
- Write tests for new behavior and for bug fixes.
- Keep tests deterministic; avoid network or time dependencies unless mocked.
- Name tests to describe intent, not implementation.
- Prefer unit tests; add integration tests only when needed.

### File and directory layout
- Keep modules small and cohesive; split files when they exceed ~300–500 lines.
- Co-locate tests with code if the ecosystem prefers it; otherwise use `tests/`.
- Avoid deeply nested directories; keep paths readable.
- Keep configuration files at repo root when possible.

### Documentation
- Update README or docs when behavior changes.
- Write docstrings/comments only for non-obvious logic.
- Include usage examples for public APIs.

### Git hygiene
- Keep commits focused on a single change.
- Avoid committing generated files unless the repo expects them.
- Do not commit secrets; use env vars or config templates.

## Linting guidance (until tooling exists)
- Prefer a single linter/formatter per language.
- Run formatters before linting when both are configured.
- Treat lint warnings as errors in CI when possible.
- If adding tooling, document exact versions and commands here.

## File naming conventions (recommended defaults)
- Directories: `kebab-case`.
- JS/TS files: `camelCase.ts` or `camelCase.tsx`.
- React components: `PascalCase.tsx`.
- SQL files: `snake_case.sql`.
- Python files: `snake_case.py`.
- Go files: `snake_case.go`.
- Rust files: `snake_case.rs`.
- Tests: match the language norm (`*.test.ts`, `*_test.go`, `test_*.py`).
- Config files: follow tool conventions (e.g., `.eslintrc.cjs`, `pyproject.toml`).
- DB columns: `snake_case`.
- API JSON fields: `camelCase`.
- Docs filenames must be strict camelCase (repo-owned docs only).

## When you add tooling, update this section
- Add exact commands for build/lint/format/test (include single-test example).
- Link to config files and note any non-default rules.
- Record minimum required versions (Node, Python, Go, etc.).
- Document any pre-commit hooks or CI requirements.

## Agent operating rules
- Do not assume language or framework; inspect the repo first.
- Never delete or revert unrelated changes.
- Keep changes minimal and consistent with existing style.
- Ask a targeted question only if blocked.
- Do not run any git commands.

## TODO for repository maintainers
- Add a README describing the project purpose.
- Add automated tests and document commands here.

## Cursor/Copilot rules
- None found at the time of writing.

# Data / Time Conventions
·	Database stores UTC timestamps.
·	Frontend displays SAST.
·	Never store local time in DB.
·	Access logs include response header bytes (response_header_bytes).
·	Frontend date inputs use YYYY-MM-DD format.

# Do / Don’t Checklist
## Do
·	Use archive/unarchive endpoints (no delete).
·	Keep dark theme contrast high.
·	Update docs when endpoints or ports change.
·	Document systemd/quadlet changes if scripts change.

## Don’t
·	Add delete endpoints.
·	Store local timestamps in DB.
·	Bypass validation middleware.
·	Introduce new time pickers outside TimeSelector.
·	Use non-camelCase doc filenames.


## Appendix: command placeholders (replace with real ones)
- Build: `npm run build` (from `backend/` or `frontend/`)
- Lint: `npm run lint` (from `backend/` or `frontend/`)
- Format: `<command>`
- Test (all): `<command>`
- Test (single): `<command>`
- Dev server: `npm run dev` (from `backend/` or `frontend/`)
- Typecheck: `npm run build` (backend) / `tsc --noEmit` (frontend if added)
- Clean: `<command>`
- Docs: `<command>`
- Release: `<command>`
- Bench: `<command>`
- Coverage: `<command>`
