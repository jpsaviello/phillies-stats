import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { handleChat } from './chat.js'
import { mlbProxy, getOdds, getConfig, type RouteResult } from './core.js'

export const app = new Hono().basePath('/api')

function reply(c: Context, result: RouteResult) {
  return c.json(result.body as object, result.status as ContentfulStatusCode)
}

app.post('/chat', async c => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  return reply(c, await handleChat(body))
})

app.get('/health', c => c.json({ ok: true }))

app.get('/config', c => reply(c, getConfig()))

app.get('/mlb/*', async c => {
  const path = c.req.path.slice('/api/mlb'.length)
  const search = new URL(c.req.url).search
  return reply(c, await mlbProxy(path, search))
})

app.get('/odds', async c => reply(c, await getOdds()))
