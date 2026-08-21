// Per-user starred players: list, add, remove. See
// docs/superpowers/specs/2026-08-06-favorite-players-design.md
//
// Same framework-agnostic contract as auth.ts — already-parsed bodies and the
// session token as plain values, so server/src/app.ts (Hono) and api/index.ts
// (Vercel) both call these unchanged. No Hono import, see core.ts.

import type { Pool } from 'pg'
import { authorize } from './authorize.js'
import type { RouteResult } from './core.js'

const MAX_FAVORITES = 50
const MAX_PLAYER_NAME_CHARS = 100

// Type alias, not interface: pg's query<T> constrains T to QueryResultRow's
// index signature, which interfaces don't implicitly satisfy.
type FavoriteRow = { player_id: number; player_name: string }
// count() is bigint in Postgres, which node-postgres hands back as a STRING
// rather than a number — parsed explicitly below.
type CountRow = { live_count: string; already_starred: string }

interface Favorite {
  playerId: number
  playerName: string
}

// Returned by every route, including the two mutations, so the client always
// replaces its state from one authoritative list and can never drift.
async function readFavorites(pool: Pool, userId: string): Promise<Favorite[]> {
  const rows = await pool.query<FavoriteRow>(
    'SELECT player_id, player_name FROM favorite_players WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC',
    [userId]
  )
  return rows.rows.map(row => ({ playerId: row.player_id, playerName: row.player_name }))
}

// Returns a human-readable problem, or null when valid — same convention as
// auth.ts's validateEmail.
function validatePlayerId(raw: unknown): string | null {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0) {
    return 'player_id must be a positive integer'
  }
  return null
}

function validatePlayerName(name: string): string | null {
  if (name.length === 0) return 'player_name is required'
  if (name.length > MAX_PLAYER_NAME_CHARS) {
    return `player_name must be at most ${MAX_PLAYER_NAME_CHARS} characters`
  }
  return null
}

function playerIdFrom(requestBody: unknown): unknown {
  return (requestBody as { playerId?: unknown } | null | undefined)?.playerId
}

function playerNameFrom(requestBody: unknown): string {
  const raw = (requestBody as { playerName?: unknown } | null | undefined)?.playerName
  return typeof raw === 'string' ? raw.trim() : ''
}

export async function listFavorites(sessionToken: string | undefined): Promise<RouteResult> {
  const auth = await authorize(sessionToken, 'favorites')
  if (!auth.ok) return auth.result

  try {
    return { status: 200, body: { favorites: await readFavorites(auth.pool, auth.userId) } }
  } catch (err) {
    console.error('list favorites failed', err)
    return { status: 502, body: { error: 'favorites unavailable' } }
  }
}

export async function addFavorite(
  requestBody: unknown,
  sessionToken: string | undefined
): Promise<RouteResult> {
  const auth = await authorize(sessionToken, 'favorites')
  if (!auth.ok) return auth.result

  const playerId = playerIdFrom(requestBody)
  const playerIdProblem = validatePlayerId(playerId)
  if (playerIdProblem !== null) return { status: 400, body: { error: playerIdProblem } }
  const playerName = playerNameFrom(requestBody)
  const playerNameProblem = validatePlayerName(playerName)
  if (playerNameProblem !== null) return { status: 400, body: { error: playerNameProblem } }

  try {
    const counts = await auth.pool.query<CountRow>(
      `SELECT count(*) FILTER (WHERE deleted_at IS NULL) AS live_count,
              count(*) FILTER (WHERE deleted_at IS NULL AND player_id = $2) AS already_starred
         FROM favorite_players WHERE user_id = $1`,
      [auth.userId, playerId]
    )
    const row = counts.rows[0]
    const liveCount = Number(row?.live_count ?? 0)
    const alreadyStarred = Number(row?.already_starred ?? 0) > 0
    // The already-starred check has to come second: re-starring an existing
    // favorite while at the cap is a no-op refresh and must still succeed.
    if (liveCount >= MAX_FAVORITES && !alreadyStarred) {
      return { status: 409, body: { error: `you can star at most ${MAX_FAVORITES} players` } }
    }

    // Resurrects a previously un-starred row rather than inserting a duplicate —
    // this is what the non-partial unique index buys (see the migration).
    await auth.pool.query(
      `INSERT INTO favorite_players (user_id, player_id, player_name) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, player_id)
       DO UPDATE SET deleted_at = NULL, player_name = EXCLUDED.player_name, updated_at = now()`,
      [auth.userId, playerId, playerName]
    )
    return { status: 200, body: { favorites: await readFavorites(auth.pool, auth.userId) } }
  } catch (err) {
    console.error('add favorite failed', err)
    return { status: 502, body: { error: 'favorites unavailable' } }
  }
}

export async function removeFavorite(
  requestBody: unknown,
  sessionToken: string | undefined
): Promise<RouteResult> {
  const auth = await authorize(sessionToken, 'favorites')
  if (!auth.ok) return auth.result

  const playerId = playerIdFrom(requestBody)
  const playerIdProblem = validatePlayerId(playerId)
  if (playerIdProblem !== null) return { status: 400, body: { error: playerIdProblem } }

  try {
    // Zero rows updated is still a success: the caller's intent ("this should
    // not be starred") is satisfied either way.
    await auth.pool.query(
      'UPDATE favorite_players SET deleted_at = now(), updated_at = now() WHERE user_id = $1 AND player_id = $2 AND deleted_at IS NULL',
      [auth.userId, playerId]
    )
    return { status: 200, body: { favorites: await readFavorites(auth.pool, auth.userId) } }
  } catch (err) {
    console.error('remove favorite failed', err)
    return { status: 502, body: { error: 'favorites unavailable' } }
  }
}
