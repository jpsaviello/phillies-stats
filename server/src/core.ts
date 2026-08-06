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

export async function mlbProxy(path: string, search: string): Promise<RouteResult> {
  const match = MLB_ALLOWED.find(([p]) => path.startsWith(p))
  if (!match) {
    return { status: 403, body: { error: 'path not allowed' } }
  }
  const res = await fetch(`${match[1]}${path}${search}`)
  if (!res.ok) return { status: 502, body: { error: `MLB API ${res.status}` } }
  return { status: 200, body: await res.json() }
}

const ODDS_CACHE_TTL = 30 * 60 * 1000
let oddsCache: { timestamp: number; data: unknown } | null = null

export async function getOdds(): Promise<RouteResult> {
  if (oddsCache && Date.now() - oddsCache.timestamp < ODDS_CACHE_TTL) {
    return { status: 200, body: oddsCache.data }
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
  return { status: 200, body: data }
}

// Runtime feature flag read from env each call so it can be flipped by
// redeploying the backend (or editing the k8s Deployment env / Vercel env var)
// without a frontend rebuild. Defaults to on; set SHOW_ALLSTAR_BANNER=false to hide.
export function getConfig(): RouteResult {
  return { status: 200, body: { allStarBanner: process.env.SHOW_ALLSTAR_BANNER !== 'false' } }
}
