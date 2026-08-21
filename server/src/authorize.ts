// Shared session-authorization preamble for per-account routes. Extracted out
// of favorites.ts so profile.ts can reuse it without duplicating the
// getPool-null / resolveSessionUser-null branching. Same framework-agnostic
// contract as the rest of this backend — no Hono import, see core.ts.
//
// Unlike /api/me this does NOT fail soft: it's only ever called once sign-in
// state is already known (the client has already seen a real user from /me),
// so an expired session here is a real error the client should be able to see.

import type { Pool } from 'pg'
import { resolveSessionUser } from './auth.js'
import type { RouteResult } from './core.js'
import { getPool } from './db.js'

export type Authorized =
  | { ok: true; pool: Pool; userId: string }
  | { ok: false; result: RouteResult }

// `feature` names the resource in the 503 body, e.g. 'favorites not
// configured' / 'profile not configured' — keeps each caller's error strings
// unchanged from before this was extracted.
export async function authorize(
  sessionToken: string | undefined,
  feature: string
): Promise<Authorized> {
  const pool = getPool()
  if (pool === null) {
    return { ok: false, result: { status: 503, body: { error: `${feature} not configured` } } }
  }
  const user = await resolveSessionUser(pool, sessionToken)
  if (user === null) {
    return { ok: false, result: { status: 401, body: { error: 'sign in required' } } }
  }
  return { ok: true, pool, userId: user.id }
}
