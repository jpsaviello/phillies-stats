import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { getCurrentUser, login, logout, signup } from './auth.js'
import { handleChat } from './chat.js'
import { isHttpsFrom, sessionTokenFrom } from './cookies.js'
import { addFavorite, listFavorites, removeFavorite } from './favorites.js'
import { mlbProxy, getOdds, getConfig, type RouteResult } from './core.js'
import { runDailyEmails, unsubscribe } from './notifications.js'
import { changePassword, deleteAccount, getProfile, updateAvatar, updateProfile } from './profile.js'
import { clientIpFrom } from './rateLimit.js'

export const app = new Hono().basePath('/api')

function reply(c: Context, result: RouteResult) {
  // append:true so multiple Set-Cookie values stay separate headers rather than
  // overwriting each other. No-ops for every route that sets no cookies.
  for (const cookie of result.cookies ?? []) {
    c.header('Set-Cookie', cookie, { append: true })
  }
  // Non-JSON responses (currently only the unsubscribe page) carry their own
  // content type and an already-serialized string body.
  if (result.contentType !== undefined) {
    c.header('Content-Type', result.contentType)
    return c.body(result.body as string, result.status as ContentfulStatusCode)
  }
  return c.json(result.body as object, result.status as ContentfulStatusCode)
}

// The origin this request arrived on, used to fetch briefing.json /
// on-this-day.json and to build the links inside the email. SITE_ORIGIN
// overrides it in notifications.ts when set.
function originFrom(c: Context): string {
  const url = new URL(c.req.url)
  const proto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() ?? url.protocol.replace(':', '')
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? url.host
  return `${proto}://${host}`
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

app.get('/profile', async c => reply(c, await getProfile(sessionTokenFrom(c.req.header('cookie')))))

app.post('/profile/update', async c => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  return reply(c, await updateProfile(body, sessionTokenFrom(c.req.header('cookie'))))
})

app.post('/profile/avatar', async c => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  return reply(c, await updateAvatar(body, sessionTokenFrom(c.req.header('cookie'))))
})

app.post('/profile/password', async c => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  return reply(c, await changePassword(body, sessionTokenFrom(c.req.header('cookie'))))
})

app.post('/profile/delete', async c => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  return reply(
    c,
    await deleteAccount(
      body,
      sessionTokenFrom(c.req.header('cookie')),
      isHttpsFrom(c.req.header('x-forwarded-proto'))
    )
  )
})

// Cron-triggered (see vercel.json's crons entry), authenticated with
// CRON_SECRET rather than a session cookie -- there is no user behind it.
app.get('/notifications/daily', async c =>
  reply(c, await runDailyEmails(c.req.header('authorization'), originFrom(c)))
)

// Both methods: GET for the link in the email footer, POST for the native
// one-click Unsubscribe control Gmail/Outlook render from the
// List-Unsubscribe header.
app.get('/notifications/unsubscribe', async c =>
  reply(c, await unsubscribe(c.req.query('token'), c.req.query('kind')))
)
app.post('/notifications/unsubscribe', async c =>
  reply(c, await unsubscribe(c.req.query('token'), c.req.query('kind')))
)

app.get('/health', c => c.json({ ok: true }))

app.get('/config', c => reply(c, getConfig()))

app.get('/mlb/*', async c => {
  const path = c.req.path.slice('/api/mlb'.length)
  const search = new URL(c.req.url).search
  return reply(c, await mlbProxy(path, search))
})

app.get('/odds', async c => reply(c, await getOdds()))
