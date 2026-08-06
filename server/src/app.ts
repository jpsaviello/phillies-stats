import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { getCurrentUser, login, logout, signup } from './auth.js'
import { handleChat } from './chat.js'
import { isHttpsFrom, sessionTokenFrom } from './cookies.js'
import { addFavorite, listFavorites, removeFavorite } from './favorites.js'
import { mlbProxy, getOdds, getConfig, type RouteResult } from './core.js'
import { clientIpFrom } from './rateLimit.js'

export const app = new Hono().basePath('/api')

function reply(c: Context, result: RouteResult) {
  // append:true so multiple Set-Cookie values stay separate headers rather than
  // overwriting each other. No-ops for every route that sets no cookies.
  for (const cookie of result.cookies ?? []) {
    c.header('Set-Cookie', cookie, { append: true })
  }
  return c.json(result.body as object, result.status as ContentfulStatusCode)
}

app.post('/chat', async c => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  return reply(c, await handleChat(body, clientIpFrom(c.req.header('x-forwarded-for'))))
})

app.post('/signup', async c => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  return reply(
    c,
    await signup(
      body,
      clientIpFrom(c.req.header('x-forwarded-for')),
      isHttpsFrom(c.req.header('x-forwarded-proto'))
    )
  )
})

app.post('/login', async c => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  return reply(
    c,
    await login(
      body,
      clientIpFrom(c.req.header('x-forwarded-for')),
      isHttpsFrom(c.req.header('x-forwarded-proto'))
    )
  )
})

app.post('/logout', async c =>
  reply(
    c,
    await logout(
      sessionTokenFrom(c.req.header('cookie')),
      isHttpsFrom(c.req.header('x-forwarded-proto'))
    )
  )
)

app.get('/me', async c => reply(c, await getCurrentUser(sessionTokenFrom(c.req.header('cookie')))))

app.get('/favorites', async c =>
  reply(c, await listFavorites(sessionTokenFrom(c.req.header('cookie'))))
)

app.post('/favorites/add', async c => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  return reply(c, await addFavorite(body, sessionTokenFrom(c.req.header('cookie'))))
})

app.post('/favorites/remove', async c => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  return reply(c, await removeFavorite(body, sessionTokenFrom(c.req.header('cookie'))))
})

app.get('/health', c => c.json({ ok: true }))

app.get('/config', c => reply(c, getConfig()))

app.get('/mlb/*', async c => {
  const path = c.req.path.slice('/api/mlb'.length)
  const search = new URL(c.req.url).search
  return reply(c, await mlbProxy(path, search))
})

app.get('/odds', async c => reply(c, await getOdds()))
