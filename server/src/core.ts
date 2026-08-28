// Framework-agnostic route logic shared by the k8s Node server (server/src/app.ts,
// wrapped in Hono) and the Vercel serverless function (api/[[...route]].ts, wrapped
// in @vercel/node's request/response). Deliberately has no Hono import: server/ and
// the repo root each install their own separate copy of hono, and mixing objects
// from two different copies of the same package in one bundle breaks (Hono's
// request/context types rely on module-scoped symbols that don't match across
// copies). Keeping this module framework-agnostic sidesteps that entirely.

export interface RouteResult {
  status: number
  body: unknown
  // Fully-serialized Set-Cookie header values (built by cookies.ts). Optional
  // and purely additive: every route that predates auth omits it, so both
  // wrappers' cookie handling no-ops for them.
  cookies?: string[]
  // Set only by routes whose response isn't JSON -- currently just the
  // unsubscribe link, which a mail client opens in a browser and so has to
  // answer with a readable page rather than {"ok":true}. When present, `body`
  // must already be a string; both wrappers send it verbatim. Same additive
  // contract as `cookies`: every other route omits it and is unaffected.
  contentType?: string
  // Value for the Cache-Control response header. Optional and purely additive,
  // exactly like `cookies` and `contentType`: a route that omits it is sent with
  // no Cache-Control at all, which is what every route in this file did before
  // this field existed.
  //
  // ONLY set a `public` value on a response that is identical for every visitor.
  // Vercel's edge is a SHARED cache, so `public` on a per-user route would let
  // one signed-in visitor's response be served to the next; /api/me, /api/profile,
  // /api/favorites and /api/chat say `private, no-store` for that reason. Error
  // responses carry nothing at all -- caching a 502 would pin a transient
  // upstream outage into every intermediary for the length of its max-age.
  cacheControl?: string
}

// First path segments (after /api) whose responses are specific to one signed-in
// visitor and must never be held by a shared cache.
//
// These routes send no Cache-Control today and so are not cached; stating it is
// hardening rather than a bug fix. It belongs here because this backend now sets
// `public` elsewhere -- after that, silence on a user route is indistinguishable
// from an unreviewed one, and a broad rule added later to vercel.json's `headers`
// block, or a CDN placed in front of the k8s ingress, would have no in-code
// signal telling it these are different.
//
// Centralized rather than set at each return site: auth.ts, favorites.ts,
// profile.ts and chat.ts return from roughly forty places between them, and a
// single missed one would be both silent and the exact case that leaks.
//
// `notifications` is deliberately absent: the cron route is authenticated by
// CRON_SECRET and the unsubscribe page is a one-shot token action, neither of
// which is edge-cacheable in practice.
const PRIVATE_SEGMENTS = new Set(['me', 'profile', 'favorites', 'chat', 'signup', 'login', 'logout'])

/**
 * The Cache-Control a response should carry: whatever the route asked for, or
 * `private, no-store` when it is a per-user route that asked for nothing.
 * `segment` is the first path segment after /api, which is all either wrapper
 * needs to compute and all this decision depends on.
 */
export function resolveCacheControl(
  segment: string | undefined,
  result: RouteResult
): string | undefined {
  if (result.cacheControl !== undefined) return result.cacheControl
  return segment !== undefined && PRIVATE_SEGMENTS.has(segment) ? 'private, no-store' : undefined
}

const MLB_V1 = 'https://statsapi.mlb.com/api/v1'
// Path prefixes the frontend actually uses, each mapped to its API base;
// anything else is rejected so this can't be used as an open relay. The live
// game feed is the one endpoint that lives under v1.1 instead of v1.
const MLB_ALLOWED: [prefix: string, base: string][] = [
  ['/teams/', MLB_V1],
  ['/stats', MLB_V1],
  ['/standings', MLB_V1],
  ['/schedule', MLB_V1],
  ['/people/', MLB_V1],
  ['/game/', 'https://statsapi.mlb.com/api/v1.1'],
]

// Cache-Control for a proxied MLB path, mirroring the per-endpoint TTLs in
// src/api/mlb.ts. The HTTP layer must never be more aggressive than the
// in-memory one, or those TTLs -- chosen for correctness, not tuning -- get
// overridden from underneath.
function mlbCachePolicy(path: string): string {
  // Tested BEFORE the /game/ case below, and the order is load-bearing:
  // /game/{pk}/feed/live matches both, and caching it even briefly freezes
  // LiveGameStrip, which polls it every 15s and is the one thing in this app
  // that must always be current.
  //
  // Note this deliberately catches MORE than the live strip. fetchBoxscore and
  // fetchBullpenBoxscore hit the SAME /game/{pk}/feed/live path, differing only
  // by their `fields=` query param, and they carry a 60s client TTL rather than
  // NO_CACHE. Since path alone cannot tell them apart, they take the
  // conservative branch. Nothing real is lost: the client-side cache still gives
  // them their 60s window, so this only forgoes an HTTP hit across a reload --
  // a far better trade than keying cacheability off a query string and risking
  // a frozen live feed.
  if (path.includes('/feed/live')) return 'no-store'
  // LiveGameStrip polls the schedule every 60s to decide whether a game has
  // started; a longer window would delay the live strip appearing by that much.
  if (path.startsWith('/schedule')) return 'public, max-age=60, stale-while-revalidate=240'
  // A box score can belong to a game still in progress. Currently unreachable --
  // every /game/ path this app requests is /feed/live, caught above -- but kept
  // as the correct policy for a future non-live game path such as the
  // /game/{pk}/boxscore endpoint chat.ts already uses server-side.
  if (path.startsWith('/game/')) return 'public, max-age=60'
  return 'public, max-age=300, stale-while-revalidate=1500'
}

export async function mlbProxy(path: string, search: string): Promise<RouteResult> {
  const match = MLB_ALLOWED.find(([p]) => path.startsWith(p))
  if (!match) {
    return { status: 403, body: { error: 'path not allowed' } }
  }
  const res = await fetch(`${match[1]}${path}${search}`)
  if (!res.ok) return { status: 502, body: { error: `MLB API ${res.status}` } }
  return { status: 200, body: await res.json(), cacheControl: mlbCachePolicy(path) }
}

const ODDS_CACHE_TTL = 30 * 60 * 1000
// Mirrors the client's odds profile in src/api/mlb.ts (5 min + 25 min stale).
// The 30-minute in-memory cache above is what protects the upstream key's rate
// limit; this is what stops the browser re-asking for a line that hasn't moved.
const ODDS_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=1500'
let oddsCache: { timestamp: number; data: unknown } | null = null

export async function getOdds(): Promise<RouteResult> {
  if (oddsCache && Date.now() - oddsCache.timestamp < ODDS_CACHE_TTL) {
    return { status: 200, body: oddsCache.data, cacheControl: ODDS_CACHE_CONTROL }
  }
  const key = process.env.ODDS_API_KEY
  if (!key) return { status: 503, body: { error: 'odds not configured' } }
  const url =
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/` +
    `?apiKey=${key}&regions=us&markets=h2h,spreads&bookmakers=draftkings&oddsFormat=american`
  const res = await fetch(url)
  if (!res.ok) return { status: 502, body: { error: `Odds API ${res.status}` } }
  const data = await res.json()
  oddsCache = { timestamp: Date.now(), data }
  return { status: 200, body: data, cacheControl: ODDS_CACHE_CONTROL }
}

// Runtime feature flag read from env each call so it can be flipped by
// redeploying the backend (or editing the k8s Deployment env / Vercel env var)
// without a frontend rebuild. Defaults to on; set SHOW_ALLSTAR_BANNER=false to hide.
export function getConfig(): RouteResult {
  return {
    status: 200,
    body: { allStarBanner: process.env.SHOW_ALLSTAR_BANNER !== 'false' },
    // Deliberately short. SHOW_ALLSTAR_BANNER is a runtime kill switch whose
    // whole point is flipping without a rebuild, so a long edge cache would
    // blunt the one thing this route exists to do.
    cacheControl: 'public, max-age=60',
  }
}
