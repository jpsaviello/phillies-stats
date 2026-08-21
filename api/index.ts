import type { IncomingMessage, ServerResponse } from 'node:http'
import { getCurrentUser, login, logout, signup } from '../server/src/auth.js'
import { handleChat } from '../server/src/chat.js'
import { isHttpsFrom, sessionTokenFrom } from '../server/src/cookies.js'
import { addFavorite, listFavorites, removeFavorite } from '../server/src/favorites.js'
import { mlbProxy, getOdds, getConfig, type RouteResult } from '../server/src/core.js'
import {
  changePassword,
  deleteAccount,
  getProfile,
  updateAvatar,
  updateProfile,
} from '../server/src/profile.js'
import { clientIpFrom } from '../server/src/rateLimit.js'

// Single static function handling all of /api/* — see vercel.json's
// rewrites, which forward every /api/:path* request here with the matched
// segments in req.query.path. This replaced an earlier attempt at a
// bracket-filename catch-all (api/[...route].ts): on this project that file
// name only matched exactly one path segment (Vercel treated the `...` as
// part of a literal, non-special parameter name — `req.query['...route']`,
// not the multi-segment array `req.query.route` Next.js's router would give
// you), so /api/mlb/<anything> 404'd before the function even ran. An
// explicit rewrite avoids depending on that file-name inference at all.
//
// Minimal local types for Vercel's Node.js function request/response shape
// (IncomingMessage/ServerResponse plus the query/body/status/json helpers
// Vercel adds) instead of depending on @vercel/node just for two types —
// that package pulls in Vercel's entire build toolchain as a devDependency.
interface VercelRequest extends IncomingMessage {
  query: Partial<Record<string, string | string[]>>
  body: unknown
}
interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse
  json(body: unknown): VercelResponse
}

function send(res: VercelResponse, result: RouteResult) {
  // Node's ServerResponse takes an array for multi-value headers like
  // Set-Cookie; VercelResponse extends it, so no extra typing is needed.
  if (result.cookies !== undefined && result.cookies.length > 0) {
    res.setHeader('Set-Cookie', result.cookies)
  }
  res.status(result.status).json(result.body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { path, ...queryParams } = req.query
  // The rewrite's `:path*` always comes through as one slash-joined string
  // (e.g. "mlb/stats"), never an array, regardless of segment count.
  const segments = ([] as string[]).concat(path ?? []).flatMap(p => p.split('/')).filter(Boolean)
  const [first, ...rest] = segments

  try {
    if (req.method === 'GET' && first === 'health') {
      return send(res, { status: 200, body: { ok: true } })
    }
    if (req.method === 'GET' && first === 'config') {
      return send(res, getConfig())
    }
    if (req.method === 'GET' && first === 'mlb') {
      const search = new URLSearchParams(queryParams as Record<string, string>).toString()
      return send(res, await mlbProxy(`/${rest.join('/')}`, search ? `?${search}` : ''))
    }
    if (req.method === 'GET' && first === 'odds') {
      return send(res, await getOdds())
    }
    if (req.method === 'POST' && first === 'chat') {
      return send(res, await handleChat(req.body, clientIpFrom(req.headers['x-forwarded-for'])))
    }
    // Vercel has already parsed the JSON body, so unlike app.ts's Hono
    // handlers there's no malformed-JSON try/catch to do here.
    if (req.method === 'POST' && first === 'signup') {
      return send(
        res,
        await signup(
          req.body,
          clientIpFrom(req.headers['x-forwarded-for']),
          isHttpsFrom(req.headers['x-forwarded-proto'])
        )
      )
    }
    if (req.method === 'POST' && first === 'login') {
      return send(
        res,
        await login(
          req.body,
          clientIpFrom(req.headers['x-forwarded-for']),
          isHttpsFrom(req.headers['x-forwarded-proto'])
        )
      )
    }
    if (req.method === 'POST' && first === 'logout') {
      return send(
        res,
        await logout(
          sessionTokenFrom(req.headers['cookie']),
          isHttpsFrom(req.headers['x-forwarded-proto'])
        )
      )
    }
    if (req.method === 'GET' && first === 'me') {
      return send(res, await getCurrentUser(sessionTokenFrom(req.headers['cookie'])))
    }
    // First routes here with a second path segment that isn't an MLB passthrough,
    // so unlike every branch above these have to look at `rest` as well as
    // `first` — /api/favorites and /api/favorites/add are different endpoints.
    if (first === 'favorites') {
      const token = sessionTokenFrom(req.headers['cookie'])
      if (req.method === 'GET' && rest.length === 0) {
        return send(res, await listFavorites(token))
      }
      if (req.method === 'POST' && rest[0] === 'add') {
        return send(res, await addFavorite(req.body, token))
      }
      if (req.method === 'POST' && rest[0] === 'remove') {
        return send(res, await removeFavorite(req.body, token))
      }
    }
    if (first === 'profile') {
      const token = sessionTokenFrom(req.headers['cookie'])
      if (req.method === 'GET' && rest.length === 0) {
        return send(res, await getProfile(token))
      }
      if (req.method === 'POST' && rest[0] === 'update') {
        return send(res, await updateProfile(req.body, token))
      }
      if (req.method === 'POST' && rest[0] === 'avatar') {
        return send(res, await updateAvatar(req.body, token))
      }
      if (req.method === 'POST' && rest[0] === 'password') {
        return send(res, await changePassword(req.body, token))
      }
      if (req.method === 'POST' && rest[0] === 'delete') {
        return send(
          res,
          await deleteAccount(req.body, token, isHttpsFrom(req.headers['x-forwarded-proto']))
        )
      }
    }
    return send(res, { status: 404, body: { error: 'not found' } })
  } catch (err) {
    console.error('request failed', err)
    return send(res, { status: 500, body: { error: 'internal error' } })
  }
}
