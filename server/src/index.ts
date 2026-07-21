import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { chatHandler } from './chat.js'

const app = new Hono().basePath('/api')

app.post('/chat', chatHandler)

app.get('/health', c => c.json({ ok: true }))

// Runtime feature flags read from env each request so they can be flipped by
// redeploying the backend (or editing the k8s Deployment env) without a
// frontend rebuild. Defaults to on; set SHOW_ALLSTAR_BANNER=false to hide.
app.get('/config', c =>
  c.json({
    allStarBanner: process.env.SHOW_ALLSTAR_BANNER !== 'false',
  })
)

const MLB_BASE = 'https://statsapi.mlb.com/api/v1'
// Path prefixes the frontend actually uses; anything else is rejected so
// this can't be used as an open relay.
const MLB_ALLOWED = ['/teams/', '/stats', '/standings', '/schedule', '/people/']

app.get('/mlb/*', async c => {
  const path = c.req.path.slice('/api/mlb'.length)
  if (!MLB_ALLOWED.some(p => path.startsWith(p))) {
    return c.json({ error: 'path not allowed' }, 403)
  }
  const search = new URL(c.req.url).search
  const res = await fetch(`${MLB_BASE}${path}${search}`)
  if (!res.ok) return c.json({ error: `MLB API ${res.status}` }, 502)
  return c.json(await res.json())
})

const ODDS_CACHE_TTL = 30 * 60 * 1000
let oddsCache: { timestamp: number; data: unknown } | null = null

app.get('/odds', async c => {
  if (oddsCache && Date.now() - oddsCache.timestamp < ODDS_CACHE_TTL) {
    return c.json(oddsCache.data)
  }
  const key = process.env.ODDS_API_KEY
  if (!key) return c.json({ error: 'odds not configured' }, 503)
  const url =
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/` +
    `?apiKey=${key}&regions=us&markets=h2h,spreads&bookmakers=draftkings&oddsFormat=american`
  const res = await fetch(url)
  if (!res.ok) return c.json({ error: `Odds API ${res.status}` }, 502)
  const data = await res.json()
  oddsCache = { timestamp: Date.now(), data }
  return c.json(data)
})

const port = Number(process.env.PORT ?? 8080)
serve({ fetch: app.fetch, port })
console.log(`api listening on :${port}`)
