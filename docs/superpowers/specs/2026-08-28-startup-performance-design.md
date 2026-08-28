# Design Spec: Startup performance — unblock first paint, survive a refresh

## Goal

Two independent changes to how the app *starts*, bundled into one spec because
they share a single user-visible symptom: **the time between typing the URL and
seeing Phillies data is longer than the data actually takes to arrive.**

1. **LaunchDarkly is on the critical path to first paint.** Nothing renders —
   not the header, not the pinstripe, not a skeleton — until the LD client
   resolves or its 5-second timeout fires.
2. **Nothing survives a refresh.** The request cache is memory-only and no
   `/api` response carries a `Cache-Control` header, so every reload is a full
   cold start even when the browser held the identical bytes seconds earlier.

Neither is a new feature. Both are the app throwing away work it has already
done.

## Measured baseline (2026-08-28)

| Measurement | Value | How |
|---|---|---|
| Main JS chunk | 374.05 KB (110.93 KB gzip), one chunk | `npm run build` |
| `Cache-Control` headers set by the backend | **zero**, on every route | `app.ts` / `api/index.ts` set only `Set-Cookie` and `Content-Type` |
| Typical MLB payload | ~40 KB (`/stats` hitting 43.7 KB, `/standings` 40.5 KB) | `curl … | wc -c` against statsapi |
| Requests, cold load | 15 (down from 24 pre-cache) | recorded in `CLAUDE.md` |
| Requests, full tour of all tabs | 32 (down from 67) | recorded in `CLAUDE.md` |

The in-memory cache already did the hard part. This spec extends its reach
backwards (to before the JS loads) and forwards (across a reload).

---

# Part 1 — LaunchDarkly must not block first paint

## The problem

`src/main.tsx` awaits `asyncWithLDProvider` before `createRoot` is ever called:

```ts
const LDProvider = await asyncWithLDProvider({ clientSideID, context, timeout: 5 })
createRoot(document.getElementById('root')!).render(…)
```

`asyncWithLDProvider`'s own typings state its purpose plainly: it "initializes
`launchdarkly-js-client-sdk` at the entry point of your app **prior to render**."
That is the documented, intended behavior — it trades startup latency for
zero flag flicker. This spec argues that for *this* app the trade is backwards.

Worst case is a **blank white page for a full 5 seconds**: a content blocker or
a restrictive corporate network that blackholes LD's domain doesn't fail fast,
it hangs until the timeout. Best case is still a network round trip to a
third party standing between the visitor and the club logo.

## Why this app can afford to render first

Every flag consumed in `App.tsx` is destructured with a code default:

```ts
const {
  enableDailyBriefing = true, enableOnThisDay = true, enableGameDetail = true,
  enableMatchupPreview = true, enableBullpenUsage = true, enableRosterTab = true,
} = useFlags()
```

The app is *already designed* to render correctly before LD answers — that is
the stated reason those defaults exist (`CLAUDE.md`: "defaulted `true` … so an
unreachable LD client preserves current behavior"). Blocking on LD buys nothing
those defaults don't already provide. It only delays them.

## The flicker question, answered with the actual flag values

The one real cost of rendering first is a flash: a panel appears at its code
default, then vanishes when LD reports a different value. Queried against the
`default` project, `production` environment on 2026-08-28:

| Code flag | LD key | Production | Flashes? |
|---|---|---|---|
| `enableDailyBriefing = true` | `enable-daily-briefing` | targeting on | no |
| `enableOnThisDay = true` | `enable-on-this-day` | targeting on | no |
| `enableGameDetail = true` | `enable-game-detail` | targeting on | no |
| `enableBullpenUsage = true` | `enable-bullpen-usage` | targeting on | no |
| `enableMatchupPreview = true` | *(does not exist in LD)* | n/a — default applies | no |
| `enableRosterTab = true` | *(does not exist in LD)* | n/a — default applies | no |
| `myFirstFlag` (no default) | `my-first-flag` | targeting **off** | no — bare destructure is `undefined`, and `LaunchDarklyDemoBanner` returns `null` on falsy |

**Every flag's production value equals what the code renders before LD answers.
There is no flicker to trade away today.**

> Two corrections to `CLAUDE.md` fall out of this and should be folded in:
> `enable-bullpen-usage` targeting is **on** in production (version 2), not off
> as documented; and `enableMatchupPreview` still has no LD flag, alongside
> `enableRosterTab`, which the docs do not mention either.

## The accepted residual risk

If someone later flips a kill switch **off**, a first-time visitor would briefly
see that panel before it disappears. That is acceptable, and it is the correct
trade: a kill switch is pulled in an emergency, perhaps twice a year, and a
sub-second flash on that day is a fine price for never blocking first paint on
the other 363. Returning visitors do not even pay that — see `bootstrap` below.

## Design

**Render immediately; let flags arrive.** Two changes, both in `src/main.tsx`:

### 1. Stop awaiting the provider before `createRoot`

Switch to the non-blocking initializer. `withLDProvider` initializes at
`componentDidMount`, which is precisely the behavior wanted: mount, paint, then
reconcile. `useFlags()` returns `{}` until the client is ready, so every `= true`
default applies during that window by the existing mechanism — no new code path,
no readiness plumbing, no change to any consumer.

### 2. Add `bootstrap: 'localStorage'`

`launchdarkly-js-sdk-common`'s typings declare `bootstrap?: 'localStorage' |
LDFlagSet`. With `'localStorage'`, a returning visitor evaluates flags from the
last known values **synchronously**, then reconciles against the network. That
removes even the theoretical flicker for anyone who has visited before, and it
means a blocked LD domain degrades to "yesterday's flags" instead of "defaults."

The `clientSideID` guard and the `throw` on a missing ID stay exactly as they
are. The `timeout: 5` option becomes moot for rendering but is harmless to keep.

### Alternatives considered

- **Keep `asyncWithLDProvider`, lower `timeout` to 1.** Rejected: still a blank
  page, just a shorter one, and it makes the flag values *less* reliable on slow
  connections while keeping the fundamental "third party gates our first paint"
  arrangement.
- **Keep `asyncWithLDProvider`, add `bootstrap: 'localStorage'`.** Genuinely
  helps returning visitors (LD reports ready immediately from stored values) but
  leaves the first visit — the one that forms the impression — fully blocking.
- **A `useFlagsReady()` hook gating flag-conditional panels until LD settles.**
  Rejected as over-engineering *for the current flag values*: it exists purely to
  suppress a flash that the table above shows does not occur. Worth revisiting
  only if a kill switch is ever left off for an extended period.
- **Render a loading skeleton while awaiting LD.** Rejected: it is strictly more
  code than rendering the real app, and the real app is already correct.

### Explicitly unchanged

`LaunchDarklyDemoBanner`'s bare `myFirstFlag` destructure stays bare. Giving it
a `= true` default would introduce the only genuine flash in the app.

---

# Part 2 — Survive a refresh

Two layers, independent, either shippable alone.

## 2a. Persist the request cache to `sessionStorage`

`src/utils/cache.ts` holds `entries` in a module-scope `Map`. A reload discards
it, so a refresh re-fetches ~15 requests and shows skeletons for data the user
was looking at one second ago.

The stored shape is already `{ at, value }` keyed by a string, so persistence is
close to free. Design:

- Key prefix `phl:cache:v1:` — the `v1` is cheap insurance against a future
  change to a cached payload's shape. (Request-shape changes are already
  self-handling: cache keys embed the full path and query string, so adding a
  `fields=` parameter yields a different key.)
- **Restore lazily, per key**, inside `cached()` on a memory miss — not a bulk
  hydrate at module load, which would parse every stored payload to serve one.
- **Persist only on success**, alongside the existing `entries.set`.
- **Reuse the existing `ttl` / `maxStale` logic unchanged.** A restored entry
  carries its original `at`, so a value older than `ttl + maxStale` correctly
  falls through to a network wait. Staleness needs no new rules.

### Three load-bearing details

**`ttl === 0` must never be persisted.** `NO_CACHE` (`{ ttl: 0 }`) is dedupe-only
and is what keeps `LiveGameStrip` honest — `CLAUDE.md` already warns that caching
the live feed "would silently freeze `LiveGameStrip`." But note `cached()` stores
every success in `entries` regardless of ttl; today that is harmless because the
`age < opts.ttl` check never passes for ttl 0. Writing those entries to disk
would put a live game feed in storage for no reason. Guard on `ttl <= 0`.

**`invalidate()` must clear persisted keys too.** It exists to make retry buttons
reach the network. If it only clears the in-memory `Map`, the very next call
restores the same stale value from `sessionStorage` and the retry button silently
does nothing — a worse bug than the one this change fixes.

**Nothing user-specific may ever enter this cache.** `cached()` currently wraps
only `get()` in `mlb.ts` plus `config` and `odds`. `fetchCurrentUser`,
`fetchFavorites` and `fetchProfile` all use bare `fetch` and stay that way. Once
these values are written to storage, routing an authenticated response through
`cached()` would persist one user's data into a shared browser store. This is an
invariant to state in the file's header comment, not just a present-tense fact.

### Why `sessionStorage`, not `localStorage`

`sessionStorage` is per-tab and clears when the tab closes, which matches the
goal exactly: make *this visit* — reloads, back/forward, the hash router's
navigations — fast. `localStorage` would carry stats across days; the
`ttl + maxStale` ceiling (30 minutes at most) means such entries would always be
discarded on read anyway, so it would add persistence the logic then refuses to
use. It also follows the repo's existing precedent: the only current storage use
(`AllStarBanner`'s dismiss key) is a deliberate long-lived preference, which
stats are not.

### Failure modes

| Case | Behavior |
|---|---|
| Storage unavailable (private mode, blocked site data) | try/catch, memory-only — same fail-open idiom as `AllStarBanner` |
| `QuotaExceededError` on write | catch, clear our own prefix, carry on in memory |
| Corrupt / half-written JSON | `JSON.parse` in try/catch → treat as a miss |
| Entry present but shape-drifted | validated on read (`typeof at === 'number'`) → treat as a miss |
| Single payload unusually large | skip persisting above a `MAX_PERSISTED_BYTES` cap; ~40 KB is typical, so the cap is a backstop, not a routine path |

## 2b. `Cache-Control` on the cacheable API routes

No route sets a cache header today, so the browser re-fetches everything on a
hard reload and Vercel's edge cannot serve a single byte — every visitor costs a
function invocation for JSON that is identical for all of them.

`RouteResult` gains an optional `cacheControl?: string`, following exactly the
additive contract `cookies` and `contentType` already established: every route
that omits it behaves precisely as it does today. `reply()` in `server/src/app.ts`
and `send()` in `api/index.ts` each set the header when present.

### The header values must mirror the client TTLs, not exceed them

`mlb.ts` chose its per-endpoint TTLs for correctness, and `CLAUDE.md` records
them as such. An HTTP layer more aggressive than the in-memory layer would
override those decisions from underneath and make them meaningless.

| Path | `Cache-Control` | Mirrors |
|---|---|---|
| `/game/**/feed/live` | `no-store` | `NO_CACHE` — polled every 15s; caching it freezes `LiveGameStrip` |
| `/schedule*` | `public, max-age=60, stale-while-revalidate=240` | `SCHEDULE` (1 min + 4 min stale) — `LiveGameStrip` polls it every 60s to detect first pitch |
| any other `/game/**` | `public, max-age=60` | `BOXSCORE` — may belong to a game in progress. **Currently unreachable**: `fetchBoxscore` and `fetchBullpenBoxscore` hit the *same* `/feed/live` path as the live strip, differing only by `fields=`, so they take the `no-store` branch above. Path alone cannot separate them, and keying cacheability off a query string to save one HTTP hit is not worth risking a frozen live feed |
| everything else under `/mlb` | `public, max-age=300, stale-while-revalidate=1500` | `STATS` (5 min + 25 min stale) |
| `/odds` | `public, max-age=300, stale-while-revalidate=1500` | the client's odds profile; server already holds a 30-min in-memory cache |
| `/config` | `public, max-age=60` | short on purpose — `SHOW_ALLSTAR_BANNER` is a runtime kill switch whose value is flipping *without* a rebuild |

**Non-200 responses never carry a cache header.** `mlbProxy` returns 502 on an
upstream failure and 403 on a disallowed path; caching either would pin a
transient outage into every intermediary for five minutes.

### Vercel's edge is a *shared* cache — the safety rule

`public` on a per-user route would let one signed-in visitor's response be served
to the next. `/api/me`, `/api/profile*`, `/api/favorites*`, `/api/chat`, and the
auth routes must therefore be explicit: `private, no-store`.

Today they send no header at all and are not cached, so this is hardening rather
than a bug fix. It is in scope because *this change introduces edge caching to
this backend* — leaving user routes silent afterwards means the next person to
add a broad rule to `vercel.json`'s `headers` block, or a CDN in front of the k8s
ingress, has no in-code signal that those routes are dangerous to cache.

---

## Deliberately out of scope

- **Code-splitting the modals / LD SDK** (the 374 KB single chunk). Real and
  worth doing; it is a different change with a different blast radius.
- **Font subsetting and preload** (18 files, latin-ext + vietnamese shipped).
- **Image `width`/`height`/`loading`/`decoding` and `preconnect` to mlbstatic.**
- **nginx `gzip` and `immutable` headers for hashed assets on the k8s target.**
  Out of scope but **confirmed, not suspected** (2026-08-28): the stock
  `nginx:alpine` config ships `#gzip  on;` commented out, and serving this
  repo's real `dist/` from that image returns **no `Content-Encoding`** even when
  the client advertises `gzip, br` — `index-*.js` at its full 374,055 B against
  ~110.9 KB gzipped (3.4x), `index-*.css` at 36,004 B against ~7.2 KB (5x).
  About 292 KB of avoidable transfer per cold load. The same responses carry
  **no `Cache-Control`** either, only `ETag`/`Last-Modified`, so every repeat
  visit spends a conditional-revalidation round trip on content-hashed filenames
  that can never change; those want `immutable, max-age=31536000`. Note the
  asymmetry: Vercel compresses and sets long-lived asset headers automatically,
  so this gap affects `phillies-stats.com` only. Fixing it means adding a custom
  `nginx.conf` to the `Dockerfile`, which is a deploy-shaped change with its own
  verification path — hence separate from this spec.
- **A shared cache store for `/api/odds` across Vercel instances.** The existing
  per-instance/best-effort tradeoff is unchanged by this work.

## Feature flag: none

Consistent with how auth, favorites, and the user profile shipped. Part 1
changes when existing components mount, not what they render; Part 2 is a cache
layer whose every failure mode degrades to today's behavior. An LD flag gating
the LD provider's own initialization would also be circular.

## Verification

Per `CLAUDE.md`, `webapp-testing` is required before either part counts as done.
None of it costs money — no chat request, no Odds API call beyond the existing
30-minute server cache.

1. **First paint unblocked.** Throttle the network and block LD's domain in
   DevTools; confirm the header and `HeroStrip` paint anyway and that flags
   settle to `true` afterwards. This is the whole point of Part 1 and is not
   observable on a fast unblocked connection.
2. **No flicker.** Load with storage cleared; confirm no panel appears then
   disappears — specifically `BullpenUsage` on the Pitching tab, the one flag
   `CLAUDE.md` describes as off (it is not).
3. **Refresh is fast.** Load, reload, and confirm from the network panel that
   MLB requests are served from cache rather than refetched, and that no
   skeleton appears for data already on screen.
4. **Live strip still live.** With `?liveGamePk=<pk>`, confirm the feed still
   updates on its 15s cadence — the single most important regression to rule
   out for both parts.
5. **Retry still reaches the network.** Force a fetch failure, click a retry
   button, confirm a real request goes out (this is the `invalidate()` trap).
6. **Headers.** `curl -I` each route class; confirm the live feed says
   `no-store`, `/api/me` says `private, no-store`, and a 502 from `mlbProxy`
   carries no cache header at all.
