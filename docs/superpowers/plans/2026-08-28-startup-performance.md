# Implementation Plan: Startup performance — unblock first paint, survive a refresh

Spec: `docs/superpowers/specs/2026-08-28-startup-performance-design.md`

Ten tasks in three groups. **Part 1** (Tasks 1–2) and **Part 2** (Tasks 3–8) are
fully independent and can ship separately, in either order. Tasks 9–10 close out
whichever has landed.

No new npm dependency. No migration. No secret. No feature flag. No k8s manifest
change. `pipeline.sh` is needed only to carry Part 2's backend change to k8s —
Vercel picks up both on the push to `develop`.

---

## Part 1 — Unblock first paint

### Task 1 — Rewrite `src/main.tsx` to render without awaiting LaunchDarkly

Replace the `void (async () => { … })()` wrapper. `createRoot(...).render(...)`
must run **synchronously at module scope**, with no `await` above it.

Use the non-blocking provider (`withLDProvider`, which initializes at
`componentDidMount`) and add `bootstrap`:

```ts
bootstrap: 'localStorage',
```

Keep unchanged, verbatim:
- the three `@fontsource/barlow-condensed` imports and `./index.css` (import
  order affects CSS cascade),
- the `clientSideID` read, the `?.trim()`, and the `throw` on a missing ID,
- the `context: { kind: 'user', key: 'anonymous', anonymous: true }` object —
  `.claude/rules/launchdarkly.md` documents this as the app's deliberate
  single anonymous context,
- `<StrictMode>` wrapping the tree.

`timeout: 5` no longer gates rendering. Leave it in place; it still bounds the
client's own initialization and removing it is an unrelated change.

Add a comment recording *why* this does not block, in the register the
surrounding files use — the point is that every flag has a code default, so
awaiting LD bought nothing those defaults did not already provide, while costing
up to 5 seconds of blank page when LD is slow or blocked.

**Do not** touch `App.tsx`. The `useFlags()` destructure defaults are the
mechanism this task depends on; they need no change and must not be "tidied."

**Do not** give `LaunchDarklyDemoBanner`'s `myFirstFlag` a default. Its bare
destructure is falsy-until-ready, which is exactly right — `my-first-flag` is off
in production, and a `= true` default would create the only real flash in the app.

### Task 2 — Confirm the no-flicker claim still holds

The spec's central argument is a table of live LD values. Re-check it at
implementation time rather than trusting a days-old snapshot — a flag flipped
between writing and building turns a correct design into a visible flash.

For `default` / `production`, confirm each of `enable-daily-briefing`,
`enable-on-this-day`, `enable-game-detail`, `enable-bullpen-usage` still serves
`true`, and that `enable-matchup-preview` / `enable-roster-tab` still do not
exist. Targeting being *on* is not by itself proof of the served value — confirm
what an anonymous context actually evaluates to, in the browser, in Task 9.

If any now serves `false`, stop and revisit: the spec's rejected
`useFlagsReady()` alternative becomes the right call instead.

---

## Part 2 — Survive a refresh

### Task 3 — Persist the cache in `src/utils/cache.ts`

Add three private helpers and touch three existing lines. Nothing outside this
file changes; `cached()` keeps returning a plain promise, which is the property
that let the cache ship without changing any component.

```ts
const STORE_PREFIX = 'phl:cache:v1:'
const MAX_PERSISTED_BYTES = 512 * 1024
```

- `restore(key): Entry | undefined` — `sessionStorage.getItem`, `JSON.parse`,
  validate `typeof parsed?.at === 'number'`, all inside try/catch. Any failure
  returns `undefined` and is treated as a plain miss.
- `persist(key, entry, ttl)` — **returns immediately when `ttl <= 0`** (see the
  trap below), skips payloads over `MAX_PERSISTED_BYTES`, and on a thrown quota
  error clears our own prefix and carries on memory-only.
- `clearPersisted(prefix?)` — iterate `sessionStorage` keys under `STORE_PREFIX`
  and remove matches. Collect keys before removing; mutating during iteration
  over `sessionStorage.key(i)` skips entries.

Wire-up, three edits:

1. In `cached()`, on a memory miss, fall back to `restore()` and populate
   `entries` from it, so the rest of the function's `age` / `ttl` / `maxStale`
   logic runs **completely unchanged**. This is the whole design — restored
   entries carry their original `at`, so staleness needs no new rules.
2. In the `.then` that does `entries.set(key, { at, value })`, call `persist`
   with `opts.ttl` alongside it.
3. In `invalidate()`, mirror every branch into `clearPersisted()` — the
   no-argument clear-all **and** the prefix branch.

Extend the file's header comment: it currently explains the two problems the
cache solved; add the third (a reload discarded everything) and state the
invariant that **nothing user-specific may be routed through `cached()`**, now
that values reach a shared browser store.

#### Three traps, each of which produces a silent bug

- **`ttl <= 0` must not persist.** `cached()` writes every success into `entries`
  regardless of ttl — harmless in memory because `age < opts.ttl` never passes
  for `NO_CACHE`, but on disk it means writing the live game feed for nothing.
- **`invalidate()` must clear storage.** Miss this and every retry button in the
  app silently stops working: it clears memory, then the next call restores the
  same stale value from `sessionStorage`.
- **Collect-then-remove** when clearing, per above.

### Task 4 — Add `cacheControl` to `RouteResult`

`server/src/core.ts`:

```ts
cacheControl?: string
```

Comment it in the same register as the neighbouring `cookies` and `contentType`
fields: optional, purely additive, every existing route omits it and is
unaffected. State the shared-cache rule right there — `public` on a per-user
route would let Vercel's edge serve one signed-in visitor's response to the
next — because this field's declaration is where someone will look before using it.

### Task 5 — Emit the header from both wrappers

Additive, and symmetrical with how each already handles `cookies` /
`contentType`. Place the header set **before** the `contentType` early-return in
both, or non-JSON responses silently skip it.

- `server/src/app.ts`, `reply()`: `c.header('Cache-Control', result.cacheControl)`
- `api/index.ts`, `send()`: `res.setHeader('Cache-Control', result.cacheControl)`

Guard both on `!== undefined`. No other route logic moves.

### Task 6 — Per-path cache policy for `mlbProxy`

In `server/src/core.ts`, a small pure `mlbCachePolicy(path: string): string`
beside `MLB_ALLOWED`, mirroring the client TTLs in `mlb.ts`:

| Test | Returns |
|---|---|
| path includes `/feed/live` | `no-store` |
| path starts with `/schedule` | `public, max-age=60, stale-while-revalidate=240` |
| path starts with `/game/` | `public, max-age=60` |
| otherwise | `public, max-age=300, stale-while-revalidate=1500` |

Order matters: the live-feed test must come **before** the `/game/` test, since
`/game/{pk}/feed/live` matches both. Getting this backwards freezes
`LiveGameStrip` at a one-minute cadence — the exact failure `CLAUDE.md` warns
about for the client-side cache, reintroduced one layer down.

Attach it to the success return **only**:

```ts
if (!res.ok) return { status: 502, body: { error: `MLB API ${res.status}` } }
return { status: 200, body: await res.json(), cacheControl: mlbCachePolicy(path) }
```

The 403 (disallowed path) and 502 (upstream failure) returns get no header.

### Task 7 — Headers for `/odds` and `/config`

Same file. `getOdds()` on its 200 paths (both the in-memory-cache hit and the
fresh fetch): `public, max-age=300, stale-while-revalidate=1500`. Its 503
(no key) and 502 (upstream) returns get nothing.

`getConfig()`: `public, max-age=60`. Deliberately short — `SHOW_ALLSTAR_BANNER`
is a runtime kill switch whose entire purpose is flipping without a rebuild.

### Task 8 — `private, no-store` on every per-user route

Add `cacheControl: 'private, no-store'` to the `RouteResult`s returned from
`auth.ts` (`signup`, `login`, `logout`, `getCurrentUser`), `favorites.ts`,
`profile.ts`, and `chat.ts`.

These send no header today and are not cached, so this is hardening, not a fix.
It is in scope because Task 6 introduces edge caching to this backend: after it,
silence on a user route is indistinguishable from an unreviewed one.

Leave `notifications.ts` alone — the cron route is authenticated by
`CRON_SECRET` and the unsubscribe page is a one-shot token action; neither is
edge-cacheable in practice and both are outside this change's reasoning.

---

## Close-out

### Task 9 — Verify (`webapp-testing`, per `CLAUDE.md`)

Both servers up (`npm run dev:server` **and** `npm run dev`). Nothing here costs
money — no chat request, no Odds API call beyond the existing server-side cache.

**Part 1**
1. DevTools: block LD's domain (or throttle hard), reload. The header and
   `HeroStrip` must paint anyway; flags settle to `true` after. On a fast
   unblocked connection this is not observable, so the block is the test.
2. Clear storage, reload, watch for a panel that appears then vanishes —
   `BullpenUsage` on the Pitching tab especially. Screenshot at 1440px and 375px.
3. Confirm in the browser what an anonymous context actually evaluates each flag
   to, closing Task 2.

**Part 2**
4. Load → reload. Network panel: MLB requests served from cache, no skeleton for
   data already on screen. Compare request count against the 15/32 baselines.
5. `?liveGamePk=<pk>`: the live strip must still update on its 15s cadence.
   **The single most important regression to rule out.**
6. Force a fetch failure, click retry, confirm a real request goes out.
7. `curl -I` each route class: live feed `no-store`; `/api/me` `private,
   no-store`; a forced `mlbProxy` 502 carrying no cache header.
8. Storage disabled (private window) → app still works, memory-only.

Console must be clean throughout.

### Task 10 — Documentation

`CLAUDE.md`, in the **Request cache** section and the backend paragraph under
**Architecture**:

- the cache now persists to `sessionStorage`, why `sessionStorage` and not
  `localStorage`, and the `ttl <= 0` / `invalidate()` traps;
- the invariant that user-specific responses must never go through `cached()`;
- `RouteResult.cacheControl` as the third optional additive field, with the
  shared-edge-cache rule;
- that the HTTP TTLs deliberately mirror `mlb.ts`'s and must not exceed them.

Two stale facts to correct while in there, both found writing this plan:

- `enable-bullpen-usage` targeting is **on** in production (version 2). The
  current text says it is off and draws a contrast with the other three flags
  that no longer holds.
- `enableMatchupPreview` has no LD flag — already documented — but neither does
  `enableRosterTab`, which the docs do not mention.

If only one Part shipped, document only that Part.

---

## Risk notes

- **Part 1 is two lines of real change with an outsized failure mode.** If
  `createRoot` ends up inside an async path again, the fix silently reverts.
  Assert it by reading the built output, not just the source.
- **Part 2's dangerous edge is the live feed**, twice over — Task 3's `ttl <= 0`
  guard and Task 6's rule ordering. Both fail the same way: a frozen
  `LiveGameStrip` that looks fine in a screenshot. Test 5 in Task 9 is the gate.
- **Ordering:** 1→2 sequential. 3 standalone. 4→5 before 6/7/8. 9 after whichever
  Parts landed; 10 last.
- **Rollback:** Part 1 is a single-file revert. Part 2's backend half is inert
  once `cacheControl` stops being set, but headers already sent to browsers
  persist for their `max-age` — the longest exposure is the 5 minutes on
  `STATS`-class paths. That bounded window is the reason the values mirror the
  client TTLs rather than reaching for the hours a CDN would happily accept.
- **Do not** narrow any `fields=` request or touch `mlb.ts`'s TTL constants
  "while in there." Both are load-bearing for other components and belong to
  their own changes.
