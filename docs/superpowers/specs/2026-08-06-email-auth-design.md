---
title: Email/Password Sign-In
date: 2026-08-06
status: approved
---

## Summary

Email/password sign-up, login, logout, and session-check (`GET /api/me`), backed by a new Neon Postgres `users`/`sessions` schema. Sessions are DB-backed opaque tokens in an httpOnly cookie, not JWT. Passwords are hashed with `node:crypto`'s `scrypt` — no new npm dependencies (no bcrypt/argon2/jsonwebtoken/zod). Nothing existing is gated behind sign-in yet; this ships the auth primitive only.

## Motivation

The app had zero concept of users. A Neon Postgres database ("Phillies" project) was provisioned specifically to support real accounts — email as the username, password stored (hashed) in the database, as the user requested. With a real shared database now reachable from both deployment targets (k8s and Vercel), DB-backed sessions became the simpler and more secure choice over JWT: no signing-key management, instant revocation on logout, and it fits this codebase's demonstrated minimal-dependency style (no ORM, no validation library, hand-rolled everything already).

## Architecture

```
AuthWidget.tsx (in Header) ──POST /api/signup──▶ server/src/auth.ts::signup   ─┐
                            ──POST /api/login───▶ server/src/auth.ts::login    ├─▶ pg.Pool (server/src/db.ts) ─▶ Neon Postgres
                            ──POST /api/logout──▶ server/src/auth.ts::logout   │      users, sessions tables
App.tsx (on mount)          ──GET  /api/me──────▶ server/src/auth.ts::getCurrentUser ─┘
                            ◀── { user } + Set-Cookie: session=<opaque token> (httpOnly, SameSite=Lax) ──
```

- **Session strategy: DB-backed opaque tokens, not JWT.** A random 256-bit token (`node:crypto.randomBytes`) is set in an httpOnly cookie; only its SHA-256 hash is ever stored server-side (`sessions.token_hash`), mirroring how passwords are never stored raw. Chosen over JWT because: (1) both deployment targets now share one Neon DB, removing the old "no shared state across k8s+Vercel" argument for stateless tokens; (2) instant logout/revocation, which JWT can't do without added machinery (blocklists, short expiries + refresh); (3) zero new signing-key dependency or rotation story.
- **Password hashing:** `scrypt` with a random 16-byte salt per user, stored as `"<saltHex>:<hashHex>"`, compared with `timingSafeEqual`. `verifyPassword` always runs a scrypt computation — even when no user is found, against a fixed dummy hash — so response timing on login doesn't leak whether an email is registered.
- **New shared infra:** `RouteResult` (`server/src/core.ts`) gains an optional `cookies?: string[]` field — the first place this codebase sets response headers/cookies. Strictly additive: every existing route (`/health`, `/config`, `/mlb/*`, `/odds`, `/chat`) never sets it and is unaffected.
- **Rate limiting:** a new limiter (`server/src/authRateLimit.ts`, same Map/fixed-window/prune pattern as `rateLimit.ts`) guards login (5 attempts/15min, keyed by IP *and* normalized email independently) and signup (5/hour, IP only) — stricter than the chat limiter since failed logins are a more sensitive signal.

## API contract

All four routes follow the existing `{ error: string }` shape for every error status.

- `POST /api/signup` — body `{ email, password }`.
  - `201 { user: { id, email } }` + `Set-Cookie` on success.
  - `400` invalid email format or password outside 8–200 chars.
  - `409` email already registered.
  - `429` signup rate limit hit.
  - `503 { error: 'auth not configured' }` if `DATABASE_URL` is missing (read fresh per request, like `/api/odds`).
- `POST /api/login` — body `{ email, password }`.
  - `200 { user: { id, email } }` + `Set-Cookie` on success.
  - `401 { error: 'invalid email or password' }` — identical message whether the email doesn't exist or the password is wrong (no enumeration leak).
  - `429` login rate limit hit (checked before any DB work).
  - `503` if unconfigured.
- `POST /api/logout` — no body required.
  - **Always** `200 { ok: true }` + a clearing `Set-Cookie`, even with no cookie or a DB failure — logout must never fail from the client's perspective. Session revocation in the DB is best-effort; errors are logged, never surfaced.
- `GET /api/me`
  - `200 { user: { id, email } }` if the session cookie is valid.
  - `200 { user: null }` for every other case — no cookie, expired/revoked session, or even `DATABASE_URL` missing. **Deliberate deviation** from the `503`-when-unconfigured pattern every other route uses: `/me` is polled on every page load to decide what the header shows, so it needs to fail soft exactly like `fetchConfig()` does, rather than require bespoke frontend error handling.

## Frontend

- `src/types/auth.ts` (new) — `export interface User { id: string; email: string }`, matching `src/types/mlb.ts`'s exported-interface-only convention.
- `src/api/auth.ts` (new) — matches `src/api/chat.ts`'s exact pattern: bare `fetch`, explicit JSON, two-step error handling. `credentials: 'include'` is the first cookie-bearing fetch in this codebase. Exports `signup`, `login`, `logout`, `fetchCurrentUser` (fails soft to `null` on any failure, mirroring `fetchConfig()`).
- `src/components/AuthWidget.tsx` (new) — a modal, not a persistent floating panel like `ChatWidget` (sign-in is an occasional action). Signed-out: small "Sign In" button in the header. Signed-in: shows the user's email + a "Sign out" link. Modal toggles between sign-in/sign-up mode; inputs/submit button reuse `ChatWidget.tsx`'s exact Tailwind classes.
- `src/components/Header.tsx` — was zero-prop and purely presentational; gains `user`/`onAuthChange` props and a `justify-between` layout so `AuthWidget` sits right-aligned next to the existing logo/title.
- `src/App.tsx` — gains `const [user, setUser] = useState<User | null>(null)`, populated via `fetchCurrentUser()` in a `useEffect` mirroring the existing `fetchConfig()` effect, passed into `<Header user={user} onAuthChange={setUser} />`.

## Secrets

- Dev: `DATABASE_URL` (and `DATABASE_URL_UNPOOLED`) already in the gitignored `.env.local`, loaded by `tsx --env-file`.
- k8s: Secret `phillies-stats-db`, created imperatively by the user, referenced with `secretKeyRef` + `optional: true` — pod starts without it, auth routes 503, `/me` fails soft to `{ user: null }`.
- Vercel: `DATABASE_URL` added as an environment variable in the project dashboard.
- Root `package.json` gains `pg` as a dependency (matching the existing `@anthropic-ai/sdk` duplication) so Vercel's bundler can resolve it for `api/index.ts`.

## Accepted caveats

- No password reset / forgot-password flow — nothing in this app sends email today.
- No email verification.
- LaunchDarkly's evaluation context stays hardcoded anonymous. `src/main.tsx`'s `asyncWithLDProvider` call runs in a top-level IIFE before React even mounts, outside any component that could react to auth state changing — wiring the real signed-in user's key into the LD context is a real architectural change, deferred.
- Nothing is gated behind sign-in yet — this ships signup/login/logout/me only. No existing feature's behavior changes based on auth state.
- Sessions are naturally per-domain (phillies-stats.com vs phillies-stats.vercel.app) even though accounts are shared via the one Neon DB — expected, not a bug. An account created on one deployment works on the other, but you're logged in separately on each.
- No CSRF token — `SameSite=Lax` on the session cookie already blocks it from being attached to cross-site POST requests, and no CORS is enabled anywhere in this backend.
- In-memory rate-limit counters and the `pg.Pool` are both best-effort per-instance on Vercel (cold start resets them), a hard guarantee only on the long-running k8s replica — same accepted tradeoff as the odds cache and the chat rate limiter.
- No feature flag gates this rollout (user's explicit choice) — unlike `enableDailyBriefing`/`enableOnThisDay`, this is new additive UI that can't break an existing feature, so a kill switch has less value here.
