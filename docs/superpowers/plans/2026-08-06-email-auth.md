# Email/Password Sign-In Implementation Plan

> Spec: docs/superpowers/specs/2026-08-06-email-auth-design.md
> Execution mode: TBD (single-session or multi-agent, decide when work starts)

**Goal:** Add signup, login, logout, and session-check (`/api/me`) backed by a new Neon Postgres `users`/`sessions` schema, using DB-backed opaque session tokens in an httpOnly cookie — no JWT, no bcrypt/argon2, no new npm dependencies (`node:crypto` covers hashing/tokens). Nothing is gated behind sign-in yet.

**Architecture:** Framework-agnostic `server/src/auth.ts` module (same `RouteResult` convention as `core.ts`/`chat.ts`) called identically from both `server/src/app.ts` (Hono/k8s) and `api/index.ts` (Vercel). `RouteResult` gains an optional `cookies?: string[]` field — the first cookie support anywhere in this backend.

**Tech stack:** Hono + `pg` (node-postgres) + `node:crypto` (server, ESM/NodeNext), React 19 + Tailwind v4 tokens (client). No new npm dependencies anywhere except duplicating `pg` into the root `package.json`.

## Global Constraints

- No new npm dependencies (no bcrypt/argon2/jsonwebtoken/zod/cookie-parser). `node:crypto` covers hashing, tokens, and timing-safe comparison.
- Never log raw passwords or raw session tokens — only their hashes. DB-error `console.error` calls must not include request bodies.
- Every backend error stays `{ error: string }`, except `/api/me`'s deliberate `{ user: null }` non-error empty state and `/api/logout`'s always-`200 { ok: true }` (both intentional, see spec).
- `phillies-*` Tailwind tokens only for new UI; match `ChatWidget.tsx`'s exact input/button classes.
- No git add/commit/push — user handles git.
- `npm run lint`, `npm run build`, `npm --prefix server run build` must pass after every task. **Known pre-existing gap, not introduced here:** neither build type-checks `api/index.ts` (its `tsconfig.json` references exclude it) — verify Vercel-side changes with `npx vercel dev` instead.

### Task 1: Database schema

**Files:** `server/migrations/001_users_and_sessions.sql` (new)

No ORM/migration runner — matches this repo's zero-framework conventions (no Drizzle/Flyway anywhere). A plain `.sql` file applied once.

Applied via `npx neon psql -- -f server/migrations/001_users_and_sessions.sql`, not a bare `psql` invocation — **verified this session that `psql` is not installed locally** (`which psql` → not found). The Neon CLI (already installed/authenticated when the database was provisioned) has an embedded TypeScript psql fallback for exactly this case; confirmed working with `npx neon psql -- -c "SELECT 1"`, which connected and returned a row with no local psql binary present. This needs no new local tooling.

```sql
-- gen_random_uuid() is a Postgres 13+ core builtin, no CREATE EXTENSION needed
-- on Neon. No FK constraints anywhere — relationship integrity is enforced in
-- server/src/auth.ts, per this repo's schema conventions.

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,               -- always stored trim+lowercased by the app
  password_hash TEXT NOT NULL,       -- "<saltHex>:<hashHex>", scrypt
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Partial unique index excludes soft-deleted rows, so a future
-- account-deletion feature could let the email be reused later.
CREATE UNIQUE INDEX users_email_key ON users (email) WHERE deleted_at IS NULL;

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,             -- plain uuid, no FK
  token_hash TEXT NOT NULL,          -- sha256 hex of the raw cookie token
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ             -- set on logout; NULL = still live
);

CREATE UNIQUE INDEX sessions_token_hash_key ON sessions (token_hash);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
```

- [ ] Write the migration file above.
- [ ] Apply it against Neon: `npx neon psql -- -f server/migrations/001_users_and_sessions.sql`.
- [ ] Verify: `npx neon psql -- -c '\d users'` and `npx neon psql -- -c '\d sessions'` show the expected columns/indexes.

### Task 2: Shared infrastructure — cookies, DB pool, crypto

**Files:** `server/src/core.ts` (edit), `server/src/cookies.ts` (new), `server/src/db.ts` (new), `server/src/crypto.ts` (new), `server/src/app.ts` (edit), `api/index.ts` (edit)

- [ ] `core.ts`: add `cookies?: string[]` to `RouteResult`.
- [ ] `cookies.ts` (new): `serializeCookie(name, value, opts)` building a `Set-Cookie` string (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` unless disabled, optional `Max-Age`); `isHttpsFrom(xForwardedProto)` deriving `Secure` from the request's actual scheme (`k8s/base/ingress.yaml` has no TLS section — a hardcoded `Secure` would silently make the cookie unsendable there, since browsers drop `Secure` cookies on non-HTTPS responses); `sessionTokenFrom(cookieHeader)` parsing the session token out of the `Cookie` request header; `SESSION_COOKIE_NAME` constant.
- [ ] `db.ts` (new): `getPool(): Pool | null`. Reconciles the "read env fresh every call" convention with a `Pool` being stateful — `process.env.DATABASE_URL` is checked every call, but the `Pool` itself is built once, lazily, on first use, and reused for the process lifetime. Register a `pool.on('error', ...)` handler (an unhandled idle-client error otherwise crashes the process).
- [ ] `crypto.ts` (new): `hashPassword(password)` / `verifyPassword(password, storedHashOrNull)` (scrypt, random 16-byte salt, `timingSafeEqual`; always computes even with no stored hash, against a fixed dummy hash, to avoid timing-based user enumeration); `generateSessionToken()` (256-bit `randomBytes` hex); `hashSessionToken(token)` (sha256 — fast, since this runs on every authenticated request, not just once per login).
- [ ] `app.ts`: update `reply()` to apply `result.cookies` via `c.header('Set-Cookie', cookie, { append: true })` for each entry.
- [ ] `api/index.ts`: update `send()` to call `res.setHeader('Set-Cookie', result.cookies)` when `result.cookies?.length`.
- [ ] `npm --prefix server run build` clean. Regression check: curl `/api/health`, `/api/config`, `/api/mlb/standings`, `/api/odds`, `/api/chat` (malformed body) still behave identically — confirms the `reply`/`send` change is non-breaking.

### Task 3: `server/src/auth.ts` + `server/src/authRateLimit.ts`

**Files:** `server/src/authRateLimit.ts` (new), `server/src/auth.ts` (new)

- [ ] `authRateLimit.ts`: same `Map`/fixed-window/prune pattern as `rateLimit.ts`, reusing its exported `clientIpFrom` as-is.
  - `checkLoginLimit(ip, normalizedEmail): RouteResult | null` — 5 attempts / 15 min, keyed by **both** IP and email independently (catches distributed credential stuffing against one victim email *and* one attacker spraying many emails from one IP). `429 { error: 'Too many login attempts — wait 15 minutes and try again.' }`.
  - `checkSignupLimit(ip): RouteResult | null` — 5 / hour, IP only. `429 { error: 'Too many signup attempts — wait an hour and try again.' }`.
- [ ] `auth.ts`, four exports, all `Promise<RouteResult>`, `clientIp`/`isHttps` threaded in as plain values (same pattern as `handleChat`'s `clientIp` param):
  - `signup(requestBody, clientIp, isHttps)` — order: `checkSignupLimit` → `getPool()` null-check (`503 { error: 'auth not configured' }`) → validate email/password shape (`400`) → check existing email (`409`) → `hashPassword`, insert user → create session row → `201 { user }` + `Set-Cookie`. DB errors → `console.error`, `502 { error: 'signup failed' }`.
  - `login(requestBody, clientIp, isHttps)` — order: extract normalized email (no DB) → `checkLoginLimit(clientIp, email)` → pool check → validate shape → look up user by email → `verifyPassword` (always called, even with no user, against the dummy hash) → generic `401 { error: 'invalid email or password' }` on any mismatch → create session → `200 { user }` + `Set-Cookie` (30-day `Max-Age`). DB errors → `502 { error: 'login failed' }`.
  - `logout(sessionToken, isHttps)` — best-effort `UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, wrapped in try/catch, errors only logged. **Always** `200 { ok: true }` + clearing `Set-Cookie` (`Max-Age=0`), regardless of whether a token was present or the DB write succeeded.
  - `getCurrentUser(sessionToken)` — fails soft to `200 { user: null }` on every failure mode (no token, `getPool()` null, session not found/expired/revoked, DB error). Deliberate deviation from the `503` pattern (see spec). Look up session (`token_hash`, `revoked_at IS NULL`, `expires_at > now()`), then user (`deleted_at IS NULL`) — two queries, no join (no FK).
  - Validation helpers (hand-rolled, matching `chat.ts`'s `validateMessages`): `normalizeEmail(raw)` (trim + lowercase), `validateEmail(email)`, `validatePassword(password)` (8–200 chars — upper bound bounds scrypt cost per request).
- [ ] `npm --prefix server run build` clean.

### Task 4: Wire routes into both runtimes

**Files:** `server/src/app.ts` (edit), `api/index.ts` (edit)

- [ ] `app.ts`: add `app.post('/signup', ...)`, `app.post('/login', ...)` (both: try/catch JSON parse → `400` on malformed body, then delegate), `app.post('/logout', ...)`, `app.get('/me', ...)` (both delegate directly, reading the session token via `sessionTokenFrom(c.req.header('cookie'))` and `isHttpsFrom(c.req.header('x-forwarded-proto'))`).
- [ ] `api/index.ts`: add matching `if (req.method === 'X' && first === 'segment')` branches before the `404` fallback. `req.body` used directly (Vercel already parses JSON, matching the existing `/chat` branch's asymmetry with `app.ts`). No `vercel.json` changes — the existing `/api/:path*` catch-all already covers these segments.
- [ ] `npm --prefix server run build` clean (covers `app.ts`).
- [ ] `npx vercel dev` smoke-check of the new `api/index.ts` branches (see Global Constraints note — this file gets no local type-checking otherwise).

### Task 5: Secrets & deploy config

**Files:** `k8s/base/api-deployment.yaml` (edit), `package.json` (edit, root)

- [ ] `api-deployment.yaml`: add a third `env` entry alongside `ODDS_API_KEY`/`ANTHROPIC_API_KEY`:
  ```yaml
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: phillies-stats-db
        key: DATABASE_URL
        optional: true   # pod starts without it; auth routes 503, /me fails soft to { user: null }
  ```
- [ ] Root `package.json`: add `"pg": "^8.22.0"` to `dependencies` (matches `server/package.json`'s pinned version and the existing `@anthropic-ai/sdk` duplication rationale — Vercel's root-level `npm install` needs to resolve it when bundling `api/index.ts`, which now transitively imports `server/src/db.ts`).
- [ ] `kubectl kustomize k8s/overlays/local` (or equivalent) validates cleanly.
- [ ] `npm install` at repo root succeeds.
- [ ] **User manual steps, not scripted by this plan:**
  - `kubectl create secret generic phillies-stats-db --from-literal=DATABASE_URL='<Neon pooled connection string>'`, then `kubectl rollout restart deploy/phillies-stats-api`.
  - Add `DATABASE_URL` (same pooled string) as an environment variable in the Vercel project dashboard.

### Task 6: Frontend types + API client

**Files:** `src/types/auth.ts` (new), `src/api/auth.ts` (new)

- [ ] `types/auth.ts`: `export interface User { id: string; email: string }`.
- [ ] `api/auth.ts`: `SignupRequest`/`LoginRequest`/`AuthResponse` interfaces (matching `chat.ts`'s inline-type convention); `signup`, `login` (bare `fetch`, `credentials: 'include'`, explicit JSON, two-step error handling mirroring `sendChat` — parse `{error?}` body, fall back to a generic message, branch on `503`/`409`/`401` for friendlier text); `logout` (fire-and-forget POST, no error handling needed since the backend always 200s); `fetchCurrentUser` (fails soft to `null` on any error/non-2xx, mirrors `fetchConfig()`).
- [ ] `npm run build` (`tsc -b`) clean.

### Task 7: `AuthWidget.tsx`, `Header.tsx`, `App.tsx`

**Files:** `src/components/AuthWidget.tsx` (new), `src/components/Header.tsx` (edit), `src/App.tsx` (edit)

- [ ] `AuthWidget.tsx`: props `{ user: User | null; onAuthChange: (user: User | null) => void }`. Owns local UI state only (modal open/closed, sign-in vs sign-up mode, form fields, loading, error) — cross-cutting "am I signed in" state stays in `App.tsx`.
  - Signed out: small button (`rounded-lg border border-white/40 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10`), `aria-label="Sign in"`, opens the modal.
  - Signed in: email text (`text-sm text-blue-100`) + a "Sign out" link; click calls `logout()` then unconditionally `onAuthChange(null)`.
  - Modal: `role="dialog" aria-label="Sign in"`, centered overlay (`fixed inset-0 z-50 flex items-center justify-center bg-black/40` wrapping `bg-white rounded-lg shadow-2xl p-6 w-full max-w-sm mx-4`). Mode toggle (sign-in ↔ create-account), email + password inputs using `ChatWidget.tsx`'s exact input classes (`rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-phillies-navy focus:outline-none disabled:bg-gray-50`, `disabled={loading}`), submit button using its exact button classes (`rounded-lg bg-phillies-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-50`), inline `text-sm text-red-600` error text on failure, close button matching `ChatWidget`'s icon/markup style.
  - On success: call `signup()`/`login()`, `onAuthChange(res.user)`, clear fields, close modal. On failure: `setError(err.message)`, keep modal open, re-enable the form.
- [ ] `Header.tsx`: add `user`/`onAuthChange` props, change the root row to `flex items-center justify-between gap-3 sm:gap-4`, wrap the existing logo/title block in its own `flex items-center gap-3 sm:gap-4` div, render `<AuthWidget user={user} onAuthChange={onAuthChange} />` alongside it.
- [ ] `App.tsx`: `const [user, setUser] = useState<User | null>(null)`; `useEffect(() => { fetchCurrentUser().then(setUser) }, [])` (mirrors the existing `fetchConfig()` effect); `<Header user={user} onAuthChange={setUser} />`.
- [ ] `npm run lint` and `npm run build` clean.

### Task 8: Docs

**Files:** `CLAUDE.md` (edit), `.superpowers/sdd/progress.md` (edit)

- [ ] `CLAUDE.md`: add a paragraph describing the auth flow, `users`/`sessions` schema, the `RouteResult` cookie extension, and the `DATABASE_URL` secret — matching the density of the existing "Chat bot" section.
- [ ] `.superpowers/sdd/progress.md`: new ledger entry for `email-auth`, following the format of prior entries (Plan/Spec links, base commit, per-task completion notes, verification summary).

### Task 9: Verification

**curl (against `npm run dev:server` on `:8080`, using a cookie jar):**
- [ ] Signup happy path → `201`, `Set-Cookie` present **without** `Secure` (plain `http://localhost`, confirms `isHttpsFrom` derives correctly).
- [ ] Duplicate signup, same email → `409`.
- [ ] Weak password / malformed email → `400`.
- [ ] Login happy path → `200` + fresh `Set-Cookie`.
- [ ] Login wrong password, and login unregistered email → identical generic `401` message (no enumeration leak).
- [ ] `GET /api/me` with the login cookie → the user; without any cookie → `{ user: null }`.
- [ ] `POST /api/logout` → `200 { ok: true }` + clearing `Set-Cookie`; follow-up `/me` with the same jar → `{ user: null }`.
- [ ] Rate limit: 6 rapid wrong-password `POST /api/login` from one IP → 6th is `429`. Repeat with distinct spoofed `x-forwarded-for` per call but the same target email → still trips on the 6th (proves the email-keyed bucket works independently of IP).
- [ ] Fail-soft: temporarily unset `DATABASE_URL`, restart `dev:server` → `/signup` → `503`; `/me` → `200 { user: null }` (not an error). Restore afterward.
- [ ] `npx vercel dev` smoke pass repeating the happy paths against `api/index.ts`'s routing.

**webapp-testing (Playwright) — required before this is considered done, per this repo's CLAUDE.md:**
- [ ] Both dev servers up; header shows "Sign In" when signed out (screenshot).
- [ ] Open modal, toggle sign-in/sign-up modes (screenshot both).
- [ ] Complete signup with a fresh test email → modal closes, header reflects signed-in state, zero console errors.
- [ ] **Reload the page** → signed-in state survives (proves the `/me` + cookie round-trip works on a fresh load, not just in-memory SPA state).
- [ ] Sign out → header reverts to "Sign In"; reload again → still signed out (proves the cookie was actually cleared).
- [ ] Wrong-password login via the modal → inline error renders, form stays usable, no console exceptions.
- [ ] 375px viewport: modal not clipped (screenshot); confirm `ChatWidget` and all four tabs still render — the `Header` `justify-between` layout change shouldn't break the logo/title at narrow widths.
- [ ] Update `CLAUDE.md` with final findings/deviations (per Task 8).
