# Chat Rate Limit + Daily Cap Implementation Plan

> Follow-up to docs/superpowers/plans/2026-07-21-chat-bot.md — closes the "no rate limiting/auth" accepted caveat in docs/superpowers/specs/2026-07-21-chat-bot-design.md.
> Status: Tasks 1-3 complete and Vercel deployed+verified in production (2026-07-23). Outstanding: Anthropic key spend limit + k8s rollout (Task 4 user steps). See .superpowers/sdd/progress.md.

**Goal:** Bound what `/api/chat` can cost. A user can't be stopped from *trying* to misuse the bot (prompt-level "decline off-topic" is enforcement by politeness), so the defense is spend limits: a per-IP rate limit and a global daily request cap, plus a smaller `max_tokens`.

**Threat model recap:** the key is unreachable and tools are host-pinned, so the only real exposure is request volume — someone scripting `POST /api/chat` in a loop (bypassing the widget) or jailbreaking the bot into general-purpose use. Both are spend problems; both are bounded by capping requests.

## Architecture constraints (changed since the chat-bot plan)

The backend now has two runtimes sharing the same framework-agnostic logic:

- **k8s** — long-running Node process: `server/src/index.ts` → `app.ts` (Hono) → `handleChat()` in `server/src/chat.ts`.
- **Vercel** — serverless: `api/[[...route]].ts` calls the same `handleChat()` directly. No Hono types may leak into shared modules (see the comment in `server/src/core.ts`).

Consequences for this feature:

1. The limiter must be **framework-agnostic** (plain module, `RouteResult` returns) and called from inside the shared path, with the client IP passed in by each wrapper — IP extraction is the only framework-specific part.
2. In-memory counters are a **hard guarantee on k8s** (single replica, long-lived) but **best-effort on Vercel** (per-instance, reset on cold start) — the same accepted tradeoff as the odds cache. Accepted here too; no KV/Redis. The true hard backstop is a **spend limit on the Anthropic key itself** (user step, Task 4).

## Design decisions

- **Limits** (constants in the new module, same style as `MAX_HISTORY`): per-IP **10 requests / 15 min** fixed-window; global **200 requests / day**, day boundary computed in **America/New_York** (matches the system-prompt date convention).
- **Check order in `handleChat`: rate limit → key check → validation.** Rate-limiting first means the 429 paths are testable keyless (no paid requests needed to verify) and protect even a misconfigured deploy. Rejected requests (400s) intentionally consume budget — simpler, and hammering invalid bodies should be limited too.
- **Both limits return 429**, never 503 — the client special-cases 503 as "Chat isn't configured", so a 503 daily-cap would show the wrong message. Distinct friendly messages: per-IP → `"You're sending messages too quickly — wait a few minutes and try again."`; daily → `"The chat bot has hit its daily limit — try again tomorrow."` The existing client error path (`src/api/chat.ts` surfaces the backend `error` string as an inline bubble, tagged `error: true` and excluded from payloads) displays these with **zero client changes**.
- **IP resolution:** first entry of `x-forwarded-for` (set by the k8s ingress and by Vercel), trimmed; missing/empty → literal `'unknown'` bucket. XFF is spoofable when hitting the backend directly (NodePort bypass) — accepted; the global daily cap is the backstop that spoofing can't dodge.
- **Memory bound:** prune expired IP windows on each check so the Map can't grow unbounded.
- **`max_tokens` 4096 → 1024:** answers are prompted to be "a few sentences"; this shrinks the worst-case cost of every abuse path at no UX cost.

## Tasks

### Task 1: Limiter module + shared wiring

**Files:** `server/src/rateLimit.ts` (new), `server/src/chat.ts`

- [x] `rateLimit.ts` (framework-agnostic, no Hono imports): constants `IP_LIMIT = 10`, `IP_WINDOW_MS = 15 * 60 * 1000`, `DAILY_CAP = 200`; module-scope state `Map<string, { windowStart: number; count: number }>` + `{ day: string; count: number }` for the global counter (day = ET date via the same `Intl en-CA America/New_York` idiom as `buildSystemPrompt`). Export one function, e.g. `checkChatLimit(ip: string): RouteResult | null` — returns a 429 `RouteResult` (with the messages above) when a limit is hit, `null` when allowed (counters consumed on the allowed path). Prune expired IP entries inside the check.
- [x] `chat.ts`: `handleChat(requestBody: unknown, clientIp: string)` — new first-thing call `const limited = checkChatLimit(clientIp); if (limited) return limited` **before** the `ANTHROPIC_API_KEY` check. Change `max_tokens` to `1024` (named const `MAX_TOKENS`).
- [x] Verify: `npm --prefix server run build` clean.

### Task 2: IP plumbing in both wrappers

**Files:** `server/src/app.ts`, `api/index.ts` (the plan was written against `api/[[...route]].ts`, which no longer exists — see CLAUDE.md)

- [x] `app.ts` chat route: `handleChat(body, clientIpFrom(c.req.header('x-forwarded-for')))` — helper takes the header string, returns first comma-separated entry trimmed, else `'unknown'`. Put the helper in `rateLimit.ts` so both wrappers share it (it's framework-agnostic: string in, string out).
- [x] `api/index.ts` chat branch: same helper on `req.headers['x-forwarded-for']` (may be `string | string[]` — normalize).
- [x] Verify: `npm --prefix server run build` + root `npm run build` clean (root build bundles the Vercel function's imports).

### Task 3: Verification (zero paid requests)

- [x] Keyless curl loop against the dev server: 11 rapid `POST /api/chat` with a valid body → first 10 return 503 (keyless), 11th returns **429** with the per-IP message; different `x-forwarded-for` value still gets 503 (separate bucket).
- [x] Daily cap: temporarily not curl-able at 200 keyless requests being slow — instead verify by code review + a one-off check with the constants lowered locally (e.g. `DAILY_CAP = 3`) via a scratch edit, reverted before finishing; confirm the daily message and that a *different* IP also gets 429 (global).
- [x] webapp-testing (keyless): trigger the per-IP 429 through the widget → the friendly "too quickly" bubble renders as an inline error, input re-enables, no console exceptions.
- [x] Docs: update the chat-bot spec's accepted-caveats (rate limiting now exists; note Vercel best-effort caveat) and the CLAUDE.md Chat bot paragraph (limits + 429 behavior + check order).
- [x] Ledger entry in `.superpowers/sdd/progress.md`.

### Task 4: User steps (not code)

- [ ] Set a monthly spend limit on the API key in the Anthropic console (console.anthropic.com → Billing/Limits) — the only cap that holds across Vercel cold starts, multiple instances, and any future bug.
- [~] Redeploy: **Vercel done** (`npx vercel --prod`, 2026-07-23, limiter verified live). Still outstanding: k8s backend image rebuild + rollout (`pipeline.sh`). No manifest/env changes needed.

## Out of scope

- Durable shared counters (Vercel KV/Upstash) — revisit only if Vercel traffic ever matters.
- Auth/login, CAPTCHAs, LLM-based topic filtering — disproportionate for this app.
- Rate limiting `/api/mlb/*` and `/api/odds` — free/cached upstreams; odds already has its own cache.
