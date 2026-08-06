// Password hashing and session-token generation, built entirely on node:crypto
// (Node 22 in both Dockerfiles) — no bcrypt/argon2/jose dependency, matching
// this codebase's minimal-dependency style. Framework-agnostic, same
// no-Hono-import rule as core.ts.

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>

const KEY_LEN = 64
const SALT_BYTES = 16
const SESSION_TOKEN_BYTES = 32

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex')
  const derived = await scrypt(password, salt, KEY_LEN)
  return `${salt}:${derived.toString('hex')}`
}

// Built lazily on first use and reused, so a login attempt for an email that
// doesn't exist still pays a full scrypt round. Without it, "no such user"
// returns measurably faster than "wrong password" and response timing alone
// tells an attacker which emails are registered.
let dummyHashPromise: Promise<string> | undefined

function dummyHash(): Promise<string> {
  if (dummyHashPromise === undefined) {
    dummyHashPromise = hashPassword('timing-equalization-placeholder')
  }
  return dummyHashPromise
}

// `stored` is null when no user matched — callers must still await this rather
// than short-circuiting, or the timing equalization above buys nothing.
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const target = stored ?? (await dummyHash())
  const [salt, hashHex] = target.split(':')
  if (salt === undefined || hashHex === undefined) return false
  const derived = await scrypt(password, salt, KEY_LEN)
  const storedBuf = Buffer.from(hashHex, 'hex')
  // timingSafeEqual throws on length mismatch, so this guard has to come first.
  if (derived.length !== storedBuf.length) return false
  const matches = timingSafeEqual(derived, storedBuf)
  return stored !== null && matches
}

export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('hex')
}

// sha256 rather than scrypt: this runs on every authenticated request, not once
// per login, and the token is already 256 bits of CSPRNG output — there's no
// low-entropy secret here for a slow KDF to protect.
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
