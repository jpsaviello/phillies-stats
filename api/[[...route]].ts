import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleChat } from '../server/src/chat.js'
import { mlbProxy, getOdds, getConfig, type RouteResult } from '../server/src/core.js'

// Catch-all for /api/* on Vercel (file name is Vercel's own optional
// catch-all convention — works for any framework, not just Next.js).
// Deliberately reimplements the routing that server/src/app.ts does with
// Hono, calling the same framework-agnostic core.ts/chat.ts functions —
// see core.ts for why this doesn't just reuse the Hono app directly.
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
  const { route, ...queryParams } = req.query
  const segments = ([] as string[]).concat(route ?? [])
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
      return send(res, await handleChat(req.body))
    }
    return send(res, { status: 404, body: { error: 'not found' } })
  } catch (err) {
    console.error('request failed', err)
    return send(res, { status: 500, body: { error: 'internal error' } })
  }
}
