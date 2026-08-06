// Email/password auth: signup, login, logout, session check. See
// docs/superpowers/specs/2026-08-06-email-auth-design.md
//
// Takes already-parsed request bodies and plain values (clientIp, isHttps)
// because body parsing and header access are framework-specific — same
// contract as handleChat, so server/src/app.ts (Hono) and api/index.ts
// (Vercel) can both call these unchanged. No Hono import, see core.ts.

import type { Pool } from 'pg'
import { checkLoginLimit, checkSignupLimit, clearLoginLimit } from './authRateLimit.js'
import { SESSION_COOKIE_NAME, serializeCookie } from './cookies.js'
import type { RouteResult } from './core.js'
import { generateSessionToken, hashPassword, hashSessionToken, verifyPassword } from './crypto.js'
import { getPool } from './db.js'

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
const MIN_PASSWORD_CHARS = 8
// Upper bound exists to cap scrypt work per request, not for storage reasons.
const MAX_PASSWORD_CHARS = 200
const MAX_EMAIL_CHARS = 254

// Type alias, not interface: pg's query<T> constrains T to QueryResultRow's
// index signature, which interfaces don't implicitly satisfy.
type UserRow = { id: string; email: string }
type CredentialRow = { id: string; email: string; password_hash: string }
type SessionRow = { user_id: string }

// Deliberately loose — a full RFC 5322 implementation buys nothing here, since
// the only real proof an address works is sending mail to it, which this app
// doesn't do.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Non-strings (numbers, objects, missing fields) collapse to '' and fail the
// required check, so validation never has to re-examine the raw type.
function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : ''
}

function normalizePassword(raw: unknown): string {
  return typeof raw === 'string' ? raw : ''
}

// Returns a human-readable problem, or null when valid — same convention as
// chat.ts's validateMessages.
function validateEmail(email: string): string | null {
  if (email.length === 0) return 'email is required'
  if (email.length > MAX_EMAIL_CHARS) return `email must be at most ${MAX_EMAIL_CHARS} characters`
  if (!EMAIL_PATTERN.test(email)) return 'email must be a valid email address'
  return null
}

function validatePassword(password: string): string | null {
  if (password.length === 0) return 'password is required'
  if (password.length < MIN_PASSWORD_CHARS) {
    return `password must be at least ${MIN_PASSWORD_CHARS} characters`
  }
  if (password.length > MAX_PASSWORD_CHARS) {
    return `password must be at most ${MAX_PASSWORD_CHARS} characters`
  }
  return null
}

function credentialsFrom(requestBody: unknown): { email: string; password: string } {
  const body = requestBody as { email?: unknown; password?: unknown } | null | undefined
  return { email: normalizeEmail(body?.email), password: normalizePassword(body?.password) }
}

function sessionCookie(token: string, isHttps: boolean): string {
  return serializeCookie(SESSION_COOKIE_NAME, token, {
    secure: isHttps,
    maxAgeSeconds: SESSION_TTL_SECONDS,
  })
}

function clearedSessionCookie(isHttps: boolean): string {
  return serializeCookie(SESSION_COOKIE_NAME, '', { secure: isHttps, maxAgeSeconds: 0 })
}

function signedOut(): RouteResult {
  return { status: 200, body: { user: null } }
}

// Returns the raw token — only its hash is persisted, so this value exists
// exactly once, in the Set-Cookie header going back to the browser. Expiry is
// computed by the database so it shares a clock with the `expires_at > now()`
// check in getCurrentUser.
async function createSession(pool: Pool, userId: string): Promise<string> {
  const token = generateSessionToken()
  await pool.query(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3))',
    [userId, hashSessionToken(token), SESSION_TTL_SECONDS]
  )
  return token
}

export async function signup(
  requestBody: unknown,
  clientIp: string,
  isHttps: boolean
): Promise<RouteResult> {
  // Rate limit first, ahead of the config check and validation — mirrors
  // handleChat: the 429 path stays reachable on a misconfigured deploy, and
  // hammering malformed bodies is capped too.
  const limited = checkSignupLimit(clientIp)
  if (limited !== null) return limited

  const pool = getPool()
  if (pool === null) return { status: 503, body: { error: 'auth not configured' } }

  const { email, password } = credentialsFrom(requestBody)
  const emailProblem = validateEmail(email)
  if (emailProblem !== null) return { status: 400, body: { error: emailProblem } }
  const passwordProblem = validatePassword(password)
  if (passwordProblem !== null) return { status: 400, body: { error: passwordProblem } }

  try {
    const existing = await pool.query('SELECT 1 FROM users WHERE email = $1 AND deleted_at IS NULL', [
      email,
    ])
    if (existing.rows.length > 0) {
      return { status: 409, body: { error: 'an account with that email already exists' } }
    }

    const inserted = await pool.query<UserRow>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, await hashPassword(password)]
    )
    const user = inserted.rows[0]
    if (user === undefined) return { status: 502, body: { error: 'signup failed' } }

    const token = await createSession(pool, user.id)
    return { status: 201, body: { user }, cookies: [sessionCookie(token, isHttps)] }
  } catch (err) {
    // Never log the request body here — it holds a plaintext password.
    console.error('signup failed', err)
    return { status: 502, body: { error: 'signup failed' } }
  }
}

export async function login(
  requestBody: unknown,
  clientIp: string,
  isHttps: boolean
): Promise<RouteResult> {
  // Email is extracted before the limiter (it's one of the two keys) but
  // deliberately before any DB work, so brute force is blunted without
  // touching Postgres.
  const { email, password } = credentialsFrom(requestBody)

  const limited = checkLoginLimit(clientIp, email)
  if (limited !== null) return limited

  const pool = getPool()
  if (pool === null) return { status: 503, body: { error: 'auth not configured' } }

  const emailProblem = validateEmail(email)
  if (emailProblem !== null) return { status: 400, body: { error: emailProblem } }
  const passwordProblem = validatePassword(password)
  if (passwordProblem !== null) return { status: 400, body: { error: passwordProblem } }

  try {
    const found = await pool.query<CredentialRow>(
      'SELECT id, email, password_hash FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    )
    const row = found.rows[0]

    // Always awaited, even with no matching row — verifyPassword hashes
    // against a dummy in that case so response timing can't be used to
    // enumerate which emails are registered.
    const passwordOk = await verifyPassword(password, row?.password_hash ?? null)
    if (row === undefined || !passwordOk) {
      // One message for both "no such account" and "wrong password", for the
      // same anti-enumeration reason.
      return { status: 401, body: { error: 'invalid email or password' } }
    }

    const token = await createSession(pool, row.id)
    clearLoginLimit(clientIp, email)
    return {
      status: 200,
      body: { user: { id: row.id, email: row.email } },
      cookies: [sessionCookie(token, isHttps)],
    }
  } catch (err) {
    console.error('login failed', err)
    return { status: 502, body: { error: 'login failed' } }
  }
}

// Always succeeds from the caller's perspective: the cookie is cleared even if
// the revoke write fails, so the browser is signed out either way. A row that
// escapes revocation still expires on its own within SESSION_TTL_SECONDS.
export async function logout(
  sessionToken: string | undefined,
  isHttps: boolean
): Promise<RouteResult> {
  const pool = getPool()
  if (sessionToken !== undefined && pool !== null) {
    try {
      await pool.query(
        'UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
        [hashSessionToken(sessionToken)]
      )
    } catch (err) {
      console.error('logout revoke failed', err)
    }
  }
  return { status: 200, body: { ok: true }, cookies: [clearedSessionCookie(isHttps)] }
}

// Fails soft to { user: null } on every path, including a missing
// DATABASE_URL — a deliberate deviation from the 503-when-unconfigured
// convention. This is polled on every page load to decide whether the header
// shows "Sign In", so it needs the same shape as fetchConfig's fail-soft
// default rather than an error the frontend has to special-case.
export async function getCurrentUser(sessionToken: string | undefined): Promise<RouteResult> {
  if (sessionToken === undefined) return signedOut()

  const pool = getPool()
  if (pool === null) return signedOut()

  try {
    const session = await pool.query<SessionRow>(
      'SELECT user_id FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()',
      [hashSessionToken(sessionToken)]
    )
    const userId = session.rows[0]?.user_id
    if (userId === undefined) return signedOut()

    // Separate query rather than a join: there's no FK between these tables,
    // so the user row may legitimately be gone or soft-deleted.
    const found = await pool.query<UserRow>(
      'SELECT id, email FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    )
    const user = found.rows[0]
    if (user === undefined) return signedOut()

    return { status: 200, body: { user } }
  } catch (err) {
    console.error('session lookup failed', err)
    return signedOut()
  }
}
