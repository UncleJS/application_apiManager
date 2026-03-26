# Frontend Code Review — API Manager
**Date:** 2026-03-26  
**Scope:** `/home/jacos/0_opencode/apiManager/frontend` (read-only)

---

## 1. Architecture Overview

| Aspect | Detail |
|---|---|
| **Framework** | Next.js 14 App Router (standalone output) |
| **Runtime** | Client-only ("use client" on every page and layout component) |
| **Routing** | App Router with route group `(app)` for authenticated pages |
| **Styling** | Tailwind CSS + custom HSL CSS variables in `globals.css`; shadcn-style hand-rolled component library in `components/ui.tsx` |
| **Auth** | React Context (`lib/auth-context.tsx`) — polls `/auth/me` on mount; custom `auth:required` window event for 401 intercept |
| **API Layer** | Single `lib/api.ts` — one typed `request<T>()` helper, `credentials: "include"` (cookie-based), full typed DTO types |
| **State** | Component-local `useState` per page; no global store (Zustand/Redux). `AuthContext` is the only shared state |
| **Components** | `components/ui.tsx` — monolithic barrel (Button, Input, Badge, Table, Dialog, Tabs, Card, SelectNative); individual files for DateOnlyInput, TimeSelector, PermissionsEditor, WindowsEditor, Sidebar |
| **File count** | ~24 source files total — small, navigable codebase |
| **Env** | `NEXT_PUBLIC_API_URL` with hardcoded fallback `https://localhost:55001` |

### Auth flow (sequence)
1. Root page → server redirect to `/apis`.
2. `(app)/layout.tsx` wraps all authenticated routes in `<AuthProvider>` → `<AppShell>`.
3. `AppShell` calls `/auth/me` on mount; on failure redirects to `/login`.
4. Any 401 from any API call fires `window.dispatchEvent(new Event("auth:required"))`; `AuthProvider` listens and redirects to `/login`.
5. Login page posts credentials; on success calls `router.push("/apis"); router.refresh()`.
6. Logout fires `/auth/logout` then unconditionally redirects.

---

## 2. Strengths

- **Clean API layer** — single typed `request<T>()` in `lib/api.ts`; all DTOs typed; no `any` at the API boundary.
- **Solid auth event bus** — `auth:required` custom event decouples session expiry from individual page logic cleanly.
- **Dark theme execution** — `globals.css` uses well-chosen HSL tokens; near-zero luminance background (`0 0% 4%`), high-foreground contrast (`0 0% 98%`), lime-green primary is punchy and readable.
- **Date-only input** — `DateOnlyInput` correctly overlays the native `<input type="date">` with a monospace overlay to enforce `yyyy-mm-dd` display regardless of browser locale. Uses `lang="en-CA"` as a nudge.
- **`formatSast()` utility** — converts UTC strings to SAST (`Africa/Johannesburg`) using `Intl.DateTimeFormat`; handles null/NaN gracefully.
- **Archive-only** — no delete buttons anywhere; consistent with the archive-only data lifecycle policy.
- **RBAC in sidebar** — `NAV_ITEMS` filtered by role; server routes also enforce separately.
- **Form guards** — buttons disabled while submitting (`disabled={saving}`); inline error display on login.
- **Accessibility basics on login** — `<label htmlFor>`, `autoComplete` attributes, keyboard-submittable form.

---

## 3. Concrete Risks & Bugs

### 3.1 `formatSast` output format does not match spec
**File:** `lib/utils.ts`  
**Spec:** AGENTS.md requires `YYYY-MM-DD HH:mm` (per the repo) and the global standards say `yyyy-MM-dd HH:mm:ss` (with seconds).  
**Actual:** `Intl.DateTimeFormat` with `en-ZA` locale and no `second` option produces `"2026-03-26, 14:30"` — the regex replaces slashes but the comma after the date may or may not be present depending on the ICU version in the runtime, making the output non-deterministic across Node/browser versions.  
**Remediation:** Replace with explicit template string:
```ts
const pad = (n: number) => String(n).padStart(2, "0");
const d = new Date(value);
const tz = "Africa/Johannesburg";
// use Intl parts to get stable values
```

### 3.2 `formatSast` strips seconds — Sessions page misses required precision
**File:** `lib/utils.ts`, `app/(app)/sessions/page.tsx`  
Sessions show `created_at_utc`, `last_activity_utc`, `expires_at_utc`. The spec mandates `HH:mm:ss`. `formatSast` has no `second: "2-digit"` option, so seconds are always lost.

### 3.3 `AuthProvider` mounted twice — double `/auth/me` call on initial load
**File:** `app/(app)/layout.tsx`  
The layout renders `<AuthProvider>` which runs `refresh()` on mount. `AppShell` inside it reads from context. Both the provider mount and the `useEffect([refresh])` may cause a second call in strict mode (React 18 dev double-invoke). Not a critical bug in production, but wastes a round-trip and can cause flicker.

### 3.4 Stale `load()` reference in `useEffect` deps — potential data races
**Files:** `app/(app)/users/page.tsx`, `apis/page.tsx`, `orgs/page.tsx`, `sessions/page.tsx`  
All pages define `load` as a plain function inside the component body, then call `useEffect(() => { load(); }, [])`. Because `load` is not in the dep array, ESLint exhaustive-deps will warn. More critically, if a prop (e.g., `orgId`) changes the load function captures the old closure value and data will be stale. Currently this is masked because these pages don't re-render with new props, but it is a latent bug.

### 3.5 No error state exposed to user in most pages
**Files:** all `app/(app)/*.tsx` except `login`  
Every `load()` uses `try {} finally { setLoading(false) }` with no `catch` block (or a silent `catch {}`). Network errors, 403, 500 — all silently produce an empty list. There is no toast, no error banner, no retry button. Users see empty tables with no feedback.

### 3.6 `PermissionsEditor` `useEffect` missing `load` in deps + silently swallowed errors
**File:** `components/PermissionsEditor.tsx`  
`useEffect(() => { load(); }, [userId, organizationId])` — `load` is not in deps (ESLint warning). The `toggle` function (assign/unassign) has no try/catch; a network error will throw uncaught and leave state inconsistent (optimistic update already applied in `setAssigned`). The optimistic update happens client-side but could desync from server.

### 3.7 `WindowsEditor` silently swallows all errors
**File:** `components/WindowsEditor.tsx`  
`load()` has `catch {}` — empty catch. `handleArchive` has no try/catch at all. An archive failure leaves the item visually gone (local state not updated but stale) until next load.

### 3.8 `Dialog` component lacks focus trap and `Escape` key handler
**File:** `components/ui.tsx`  
The custom `Dialog` renders conditionally with no portal, no focus trap, and no `keydown` listener for Escape. Screen reader users and keyboard-only users cannot dismiss it. Also, clicking outside the modal does not close it (no backdrop `onClick`).

### 3.9 Role normalisation duplicated in three places
**Files:** `lib/auth-context.tsx` (does NOT normalise), `components/Sidebar.tsx`, `app/(app)/sessions/page.tsx`, `app/(app)/users/page.tsx`  
The regex `String(r).trim().toLowerCase().replace(/[\s-]+/g, "_")` is copy-pasted 3+ times. `AuthContext` stores the raw `user.role` and consumers re-normalise. If the backend ever returns a different casing, only some components would break.  
**Fix:** normalise once in `AuthContext` or expose a `useRole()` hook.

### 3.10 `NEXT_PUBLIC_API_URL` env var name mismatch vs `.env.example`
**File:** `lib/api.ts` (line 1) vs `.env.example`  
The code reads `process.env.NEXT_PUBLIC_API_URL`; the `.env.example` defines `VITE_API_BASE_URL`. The Next.js frontend will silently use the hardcoded fallback `https://localhost:55001` in every environment unless `NEXT_PUBLIC_API_URL` is explicitly set. No documented mapping exists.

### 3.11 `users/page.tsx` user filter is client-side only
**File:** `app/(app)/users/page.tsx`  
`const visibleUsers = role === "global_admin" ? ud.items : ud.items.filter((u) => u.organization_id === orgId)`  
The backend `/users` endpoint already scopes by org for non-admin roles (the backend enforces it), so this is double-filtering. But if the backend ever returns users from another org due to a bug, the client filter would be the only guard — yet it is not labelled as a security boundary.

### 3.12 `ReportsPage` catches errors silently and clears data
**File:** `app/(app)/reports/page.tsx`  
`catch { setReport(EMPTY) }` — user gets a blank table with no message. Combined with the date range not being validated before submit (empty from/to sends undefined range), a bad date input produces a confusing empty result.

### 3.13 `DateOnlyInput` is uncontrolled when `value` changes externally
**File:** `components/DateOnlyInput.tsx`  
The component initialises `internal` state once from `value ?? ""`. If `value` prop changes after mount (e.g., a form reset), the internal state is stale because `useState` ignores prop changes after first render. The controlled path (`value !== undefined`) does forward the prop correctly, but the component's own `internal` state is never synced. This can cause the overlay div to show the old value.

### 3.14 `TimeSelector` only allows 5-minute intervals — spec requires hour/minute/second matrix
**File:** `components/TimeSelector.tsx`  
The AGENTS.md spec calls for a matrix-style hour×minute×second grid picker. The current implementation is a simple `<select>` with HH:MM every 5 minutes. Seconds are not supported, which means access windows cannot be set with second granularity. This is a spec gap, not necessarily a bug if the backend also uses minute resolution.

### 3.15 `ui.tsx` Dialog has no backdrop click-outside-to-close
**File:** `components/ui.tsx`  
Backdrop is rendered as a div but has no `onClick` handler. Users cannot click outside to dismiss.

---

## 4. Missing Tests & Documentation

| Gap | Details |
|---|---|
| **Zero automated tests** | No test runner configured (`package.json` has no test script). No test files in repo. |
| **No storybook or component playground** | `components/ui.tsx` is a 300+ line barrel with no visual documentation. |
| **No `NEXT_PUBLIC_API_URL` in `.env.example`** | The required env var is undocumented; only `VITE_API_BASE_URL` appears. |
| **No loading skeleton/placeholder docs** | `loading` state renders nothing visible in several pages (just an empty table space). |
| **No JSDoc on `formatSast`** | The comment says "YYYY-MM-DD HH:mm" but omits seconds, contradicting the global standard. |
| **No README for frontend** | No `frontend/README.md` describing env vars, dev setup, component conventions. |
| **Accessibility audit** | No a11y tests (axe, Playwright). Dialog, checkbox toggles in PermissionsEditor lack `aria-label`. |

---

## 5. Top-Priority Recommendations

### P1 — Fix `formatSast` to be deterministic and include seconds
Replace locale-based formatting with `Intl.DateTimeFormat` using `formatToParts` for stable output, and add `second: "2-digit"`. This is a correctness bug affecting every timestamp in the UI.

### P2 — Add visible error states to all data-loading pages
Add a `error: string | null` state to each page's `load()`, surface a `<p className="text-destructive">` banner, and provide a retry button. Silent empty tables are the single biggest usability gap.

### P3 — Fix the env var name mismatch (`NEXT_PUBLIC_API_URL` → add to `.env.example`)
Add `NEXT_PUBLIC_API_URL=https://localhost:55001` to `.env.example` and document it in the README. Every deployment will otherwise silently hit the hardcoded fallback.

### P4 — Centralise role normalisation in `AuthContext`
Store the normalised role string in context and expose it. Remove the 3+ duplicate regex calls in Sidebar and pages. Add a `useRole()` convenience hook.

### P5 — Fix `PermissionsEditor` optimistic toggle to use rollback on error
Wrap `toggle` in try/catch; on failure revert `assigned` to pre-toggle state and show an inline error message. The current silent failure desynchronises UI state from the server.

### P6 — Add focus trap + Escape key + backdrop click to `Dialog`
Minimal viable: on mount focus the first focusable child; add `window.addEventListener("keydown", ...)` for Escape; add `onClick={onClose}` to the backdrop div.

### P7 — Add `NEXT_PUBLIC_API_URL` env var and update `useEffect` deps
All page-level `load` functions should use `useCallback` with explicit deps so ESLint exhaustive-deps passes and stale-closure data bugs are prevented.
