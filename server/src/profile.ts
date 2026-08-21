// Per-user profile: display name, phone, hometown, Phillies fan details,
// avatar, notification preferences, plus account management (password change,
// account deletion). See docs/superpowers/specs/2026-08-21-user-profile-design.md
//
// Same framework-agnostic contract as auth.ts/favorites.ts — already-parsed
// request bodies and the session token as plain values, so server/src/app.ts
// (Hono) and api/index.ts (Vercel) can both call these unchanged. No Hono
// import, see core.ts.

import type { Pool } from 'pg'
import { validatePassword } from './auth.js'
import { authorize } from './authorize.js'
import {
  checkPasswordChangeLimit,
  clearPasswordChangeLimit,
} from './authRateLimit.js'
import { SESSION_COOKIE_NAME, serializeCookie } from './cookies.js'
import type { RouteResult } from './core.js'
import { hashPassword, hashSessionToken, verifyPassword } from './crypto.js'

// Type alias, not interface: pg's query<T> constrains T to QueryResultRow's
// index signature, which interfaces don't implicitly satisfy — same
// convention as favorites.ts's FavoriteRow.
type ProfileRow = {
  display_name: string | null
  phone: string | null
  location: string | null
  favorite_player_id: number | null
  favorite_number: string | null
  fan_since: number | null
  avatar_data_url: string | null
  notify_daily_briefing: boolean
  notify_game_reminders: boolean
}

interface Profile {
  displayName: string | null
  phone: string | null
  location: string | null
  favoritePlayerId: number | null
  favoriteNumber: string | null
  fanSince: number | null
  avatarDataUrl: string | null
  notifyDailyBriefing: boolean
  notifyGameReminders: boolean
}

// Returned by GET /api/profile when the user has no row yet — signup does not
// create one, so this is the normal state for every user who hasn't saved.
const DEFAULT_PROFILE: Profile = {
  displayName: null,
  phone: null,
  location: null,
  favoritePlayerId: null,
  favoriteNumber: null,
  fanSince: null,
  avatarDataUrl: null,
  notifyDailyBriefing: false,
  notifyGameReminders: false,
}

// The Phillies were founded in 1883 — the earliest honest answer to "fan
// since." The upper bound is the current season year computed in
// America/New_York, same idiom as buildSystemPrompt in chat.ts: the server has
// no SEASON constant (that lives in src/api/mlb.ts, client-side) and the host
// clock is UTC in both containers.
const EARLIEST_FAN_SINCE_YEAR = 1883

function currentSeasonYear(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
  }).formatToParts(new Date())
  const year = parts.find(p => p.type === 'year')?.value
  return year !== undefined ? Number(year) : new Date().getUTCFullYear()
}

const MAX_DISPLAY_NAME_CHARS = 60
const MAX_PHONE_CHARS = 32
const MAX_LOCATION_CHARS = 80
const MAX_FAVORITE_NUMBER_CHARS = 3
// Only digits, spaces, and the punctuation people actually type in a phone
// number — deliberately not a full E.164 validator, since nothing here ever
// dials or texts this value. It's a note to self, not a contact channel.
const PHONE_PATTERN = /^[0-9+().\- ]+$/
const PHONE_DIGITS_MIN = 7
const PHONE_DIGITS_MAX = 15
const DIGITS_ONLY_PATTERN = /^[0-9]+$/
// data:image/{png,jpeg,webp};base64,<payload> — svg+xml is deliberately never
// allowed here: it's scriptable, unlike a raster image, and this column is
// rendered straight into an <img src> in the same origin as the app.
const AVATAR_PREFIX_PATTERN = /^data:image\/(png|jpeg|webp);base64,/
const MAX_AVATAR_CHARS = 200_000
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

// Returns a human-readable problem, or null when valid — same convention as
// auth.ts's validateEmail.
function normalizeText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

// These four take the RAW request-body value, not the already-normalized
// (trimmed, coerced-to-null-if-non-string) one — normalizeText() silently
// treats any non-string as "clear this field," so validating the normalized
// value would let a type-confused input (a number, a boolean) through as an
// accidental clear instead of a 400. favoritePlayerId/fanSince/the booleans
// below already validated the raw value; these are brought in line with that.
function validateDisplayName(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string') return 'display_name must be a string'
  if (raw.length > MAX_DISPLAY_NAME_CHARS) {
    return `display name must be at most ${MAX_DISPLAY_NAME_CHARS} characters`
  }
  return null
}

function validatePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string') return 'phone must be a string'
  if (raw.length > MAX_PHONE_CHARS) return `phone must be at most ${MAX_PHONE_CHARS} characters`
  if (!PHONE_PATTERN.test(raw)) return 'phone may only contain digits and + - ( ) . spaces'
  const digitCount = (raw.match(/[0-9]/g) ?? []).length
  if (digitCount < PHONE_DIGITS_MIN || digitCount > PHONE_DIGITS_MAX) {
    return `phone must contain ${PHONE_DIGITS_MIN} to ${PHONE_DIGITS_MAX} digits`
  }
  return null
}

function validateLocation(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string') return 'location must be a string'
  if (raw.length > MAX_LOCATION_CHARS) {
    return `location must be at most ${MAX_LOCATION_CHARS} characters`
  }
  return null
}

function validateFavoritePlayerId(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0) {
    return 'favorite_player_id must be a positive integer'
  }
  return null
}

function validateFavoriteNumber(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string') return 'favorite_number must be a string'
  const trimmed = raw.trim()
  if (trimmed.length > MAX_FAVORITE_NUMBER_CHARS) {
    return `favorite_number must be at most ${MAX_FAVORITE_NUMBER_CHARS} characters`
  }
  if (trimmed.length > 0 && !DIGITS_ONLY_PATTERN.test(trimmed)) {
    return 'favorite_number must contain only digits'
  }
  return null
}

function validateFanSince(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return 'fan_since must be an integer year'
  const maxYear = currentSeasonYear()
  if (raw < EARLIEST_FAN_SINCE_YEAR || raw > maxYear) {
    return `fan_since must be between ${EARLIEST_FAN_SINCE_YEAR} and ${maxYear}`
  }
  return null
}

function validateBoolean(raw: unknown, field: string): string | null {
  if (typeof raw !== 'boolean') return `${field} must be true or false`
  return null
}

function validateAvatarDataUrl(raw: unknown): string | null {
  if (raw === null) return null
  if (typeof raw !== 'string') return 'avatar_data_url must be a string or null'
  if (raw.length > MAX_AVATAR_CHARS) {
    return `avatar_data_url must be at most ${MAX_AVATAR_CHARS} characters`
  }
  const match = AVATAR_PREFIX_PATTERN.exec(raw)
  if (match === null) return 'avatar_data_url must be a base64 png, jpeg, or webp image'
  const payload = raw.slice(match[0].length)
  if (payload.length === 0 || !BASE64_PATTERN.test(payload)) {
    return 'avatar_data_url is not valid base64'
  }
  return null
}

function toProfile(row: ProfileRow): Profile {
  return {
    displayName: row.display_name,
    phone: row.phone,
    location: row.location,
    favoritePlayerId: row.favorite_player_id,
    favoriteNumber: row.favorite_number,
    fanSince: row.fan_since,
    avatarDataUrl: row.avatar_data_url,
    notifyDailyBriefing: row.notify_daily_briefing,
    notifyGameReminders: row.notify_game_reminders,
  }
}

async function readProfile(pool: Pool, userId: string): Promise<Profile> {
  const rows = await pool.query<ProfileRow>(
    `SELECT display_name, phone, location, favorite_player_id, favorite_number,
            fan_since, avatar_data_url, notify_daily_briefing, notify_game_reminders
       FROM user_profiles WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  )
  const row = rows.rows[0]
  return row === undefined ? DEFAULT_PROFILE : toProfile(row)
}

export async function getProfile(sessionToken: string | undefined): Promise<RouteResult> {
  const auth = await authorize(sessionToken, 'profile')
  if (!auth.ok) return auth.result

  try {
    return { status: 200, body: { profile: await readProfile(auth.pool, auth.userId) } }
  } catch (err) {
    console.error('get profile failed', err)
    return { status: 502, body: { error: 'profile unavailable' } }
  }
}

interface UpdateFields {
  displayName: string | null
  phone: string | null
  location: string | null
  favoritePlayerId: number | null
  favoriteNumber: string | null
  fanSince: number | null
  notifyDailyBriefing: boolean
  notifyGameReminders: boolean
}

function updateFieldsFrom(requestBody: unknown): UpdateFields {
  const body = requestBody as Record<string, unknown> | null | undefined
  return {
    displayName: normalizeText(body?.displayName),
    phone: normalizeText(body?.phone),
    location: normalizeText(body?.location),
    favoritePlayerId:
      typeof body?.favoritePlayerId === 'number' ? body.favoritePlayerId : null,
    favoriteNumber: normalizeText(body?.favoriteNumber),
    fanSince: typeof body?.fanSince === 'number' ? body.fanSince : null,
    notifyDailyBriefing: body?.notifyDailyBriefing as unknown as boolean,
    notifyGameReminders: body?.notifyGameReminders as unknown as boolean,
  }
}

export async function updateProfile(
  requestBody: unknown,
  sessionToken: string | undefined
): Promise<RouteResult> {
  const auth = await authorize(sessionToken, 'profile')
  if (!auth.ok) return auth.result

  const body = requestBody as Record<string, unknown> | null | undefined
  const fields = updateFieldsFrom(requestBody)

  const problem =
    validateDisplayName(body?.displayName) ??
    validatePhone(body?.phone) ??
    validateLocation(body?.location) ??
    validateFavoritePlayerId(body?.favoritePlayerId) ??
    validateFavoriteNumber(body?.favoriteNumber) ??
    validateFanSince(body?.fanSince) ??
    validateBoolean(body?.notifyDailyBriefing, 'notify_daily_briefing') ??
    validateBoolean(body?.notifyGameReminders, 'notify_game_reminders')
  if (problem !== null) return { status: 400, body: { error: problem } }

  try {
    // avatar_data_url is deliberately absent from this statement's column
    // list — a profile-field save must never touch the avatar.
    await auth.pool.query(
      `INSERT INTO user_profiles (
         user_id, display_name, phone, location, favorite_player_id,
         favorite_number, fan_since, notify_daily_briefing, notify_game_reminders
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id) DO UPDATE SET
         deleted_at = NULL,
         display_name = EXCLUDED.display_name,
         phone = EXCLUDED.phone,
         location = EXCLUDED.location,
         favorite_player_id = EXCLUDED.favorite_player_id,
         favorite_number = EXCLUDED.favorite_number,
         fan_since = EXCLUDED.fan_since,
         notify_daily_briefing = EXCLUDED.notify_daily_briefing,
         notify_game_reminders = EXCLUDED.notify_game_reminders,
         updated_at = now()`,
      [
        auth.userId,
        fields.displayName,
        fields.phone,
        fields.location,
        fields.favoritePlayerId,
        fields.favoriteNumber,
        fields.fanSince,
        fields.notifyDailyBriefing,
        fields.notifyGameReminders,
      ]
    )
    return { status: 200, body: { profile: await readProfile(auth.pool, auth.userId) } }
  } catch (err) {
    console.error('update profile failed', err)
    return { status: 502, body: { error: 'profile unavailable' } }
  }
}

export async function updateAvatar(
  requestBody: unknown,
  sessionToken: string | undefined
): Promise<RouteResult> {
  const auth = await authorize(sessionToken, 'profile')
  if (!auth.ok) return auth.result

  const raw = (requestBody as { avatarDataUrl?: unknown } | null | undefined)?.avatarDataUrl
  const avatarDataUrl = raw === undefined ? null : (raw as string | null)
  const problem = validateAvatarDataUrl(avatarDataUrl)
  if (problem !== null) return { status: 400, body: { error: problem } }

  try {
    // Row may not exist yet (avatar-first flow) — upsert touching only the
    // avatar column, same lazy-creation contract as updateProfile.
    await auth.pool.query(
      `INSERT INTO user_profiles (user_id, avatar_data_url)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         deleted_at = NULL,
         avatar_data_url = EXCLUDED.avatar_data_url,
         updated_at = now()`,
      [auth.userId, avatarDataUrl]
    )
    return { status: 200, body: { profile: await readProfile(auth.pool, auth.userId) } }
  } catch (err) {
    console.error('update avatar failed', err)
    return { status: 502, body: { error: 'profile unavailable' } }
  }
}

// --- Account management (password change, deletion) ---

type CredentialRow = { password_hash: string }

function passwordsFrom(requestBody: unknown): { currentPassword: string; newPassword: string } {
  const body = requestBody as { currentPassword?: unknown; newPassword?: unknown } | null | undefined
  return {
    currentPassword: typeof body?.currentPassword === 'string' ? body.currentPassword : '',
    newPassword: typeof body?.newPassword === 'string' ? body.newPassword : '',
  }
}

export async function changePassword(
  requestBody: unknown,
  sessionToken: string | undefined
): Promise<RouteResult> {
  const auth = await authorize(sessionToken, 'profile')
  if (!auth.ok) return auth.result

  const limited = checkPasswordChangeLimit(auth.userId)
  if (limited !== null) return limited

  const { currentPassword, newPassword } = passwordsFrom(requestBody)
  const newPasswordProblem = validatePassword(newPassword)
  if (newPasswordProblem !== null) return { status: 400, body: { error: newPasswordProblem } }
  if (newPassword === currentPassword) {
    return { status: 400, body: { error: 'new password must be different from the current password' } }
  }

  try {
    const found = await auth.pool.query<CredentialRow>(
      'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [auth.userId]
    )
    const row = found.rows[0]
    const currentOk = await verifyPassword(currentPassword, row?.password_hash ?? null)
    if (row === undefined || !currentOk) {
      return { status: 401, body: { error: 'current password is incorrect' } }
    }

    const newHash = await hashPassword(newPassword)

    // Transactional, like deleteAccount: a hash update that "succeeds" while
    // the session-revocation half fails would report failure to the caller
    // even though their password DID change, and would leave every other
    // device's session live despite the UI's "your other devices have been
    // signed out" claim. Two statements, one atomic outcome.
    const client = await auth.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
        newHash,
        auth.userId,
      ])
      // Revoke every OTHER live session — the caller (this session) stays
      // signed in, everyone else holding a cookie for this account is signed
      // out. hashSessionToken(sessionToken) identifies the caller's own row.
      if (sessionToken !== undefined) {
        await client.query(
          'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND token_hash <> $2 AND revoked_at IS NULL',
          [auth.userId, hashSessionToken(sessionToken)]
        )
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    clearPasswordChangeLimit(auth.userId)
    return { status: 200, body: { ok: true } }
  } catch (err) {
    // Never log the request body here — it holds two plaintext passwords.
    console.error('change password failed', err)
    return { status: 502, body: { error: 'password change failed' } }
  }
}

function accountPasswordFrom(requestBody: unknown): string {
  const body = requestBody as { password?: unknown } | null | undefined
  return typeof body?.password === 'string' ? body.password : ''
}

function clearedSessionCookie(isHttps: boolean): string {
  return serializeCookie(SESSION_COOKIE_NAME, '', { secure: isHttps, maxAgeSeconds: 0 })
}

// Soft-deletes the account across four tables in one transaction: the users
// row (which frees the email via its partial unique index), every live
// session, every favorite, and the profile row. This is the first
// multi-statement transaction in this backend — every other write here is a
// single statement where a partial failure is harmless, but a partial failure
// here would leave an account signed out yet still owning its email, or
// deleted with live sessions. pool.query() can't be used for BEGIN/COMMIT:
// each call may be handed a different client from the pool, so the
// transaction needs one client checked out explicitly for its whole lifetime.
export async function deleteAccount(
  requestBody: unknown,
  sessionToken: string | undefined,
  isHttps: boolean
): Promise<RouteResult> {
  const auth = await authorize(sessionToken, 'profile')
  if (!auth.ok) return auth.result

  const password = accountPasswordFrom(requestBody)

  try {
    const found = await auth.pool.query<CredentialRow>(
      'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [auth.userId]
    )
    const row = found.rows[0]
    const passwordOk = await verifyPassword(password, row?.password_hash ?? null)
    if (row === undefined || !passwordOk) {
      return { status: 401, body: { error: 'current password is incorrect' } }
    }

    const client = await auth.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('UPDATE users SET deleted_at = now(), updated_at = now() WHERE id = $1', [
        auth.userId,
      ])
      await client.query(
        'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [auth.userId]
      )
      await client.query(
        'UPDATE favorite_players SET deleted_at = now(), updated_at = now() WHERE user_id = $1 AND deleted_at IS NULL',
        [auth.userId]
      )
      await client.query(
        'UPDATE user_profiles SET deleted_at = now(), updated_at = now() WHERE user_id = $1 AND deleted_at IS NULL',
        [auth.userId]
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    return { status: 200, body: { ok: true }, cookies: [clearedSessionCookie(isHttps)] }
  } catch (err) {
    console.error('delete account failed', err)
    return { status: 502, body: { error: 'account deletion failed' } }
  }
}
