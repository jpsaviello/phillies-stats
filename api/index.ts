import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleChat } from '../server/src/chat.js'
import { mlbProxy, getOdds, getConfig, type RouteResult } from '../server/src/core.js'
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
    return send(res, { status: 404, body: { error: 'not found' } })
  } catch (err) {
    console.error('request failed', err)
    return send(res, { status: 500, body: { error: 'internal error' } })
  }
}
