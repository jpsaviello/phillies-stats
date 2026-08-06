// Brute-force guard for /api/login and /api/signup. Same module-scope
// fixed-window Map pattern as rateLimit.ts (see the comment there on the
// k8s-hard vs Vercel-best-effort tradeoff), and reuses its clientIpFrom.
//
// Stricter than the chat limiter's 10/15min because a failed login is a far
// more sensitive signal than chat volume. Login is keyed by IP *and* email
// independently: IP alone misses credential stuffing spread across many hosts
// at one victim, email alone misses one host spraying many accounts.

import type { RouteResult } from './core.js'

const LOGIN_LIMIT = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const SIGNUP_LIMIT = 5
const SIGNUP_WINDOW_MS = 60 * 60 * 1000

interface Window {
  windowStart: number
  count: number
}

const loginIpWindows = new Map<string, Window>()
const loginEmailWindows = new Map<string, Window>()
const signupIpWindows = new Map<string, Window>()

function prune(windows: Map<string, Window>, now: number, windowMs: number): void {
  for (const [key, window] of windows) {
    if (now - window.windowStart >= windowMs) windows.delete(key)
  }
}

function isOverLimit(
  windows: Map<string, Window>,
  key: string,
  now: number,
  windowMs: number,
  limit: number
): boolean {
  const window = windows.get(key)
  if (window === undefined || now - window.windowStart >= windowMs) return false
  return window.count >= limit
}

function consume(windows: Map<string, Window>, key: string, now: number, windowMs: number): void {
  const window = windows.get(key)
  if (window === undefined || now - window.windowStart >= windowMs) {
    windows.set(key, { windowStart: now, count: 1 })
  } else {
    window.count += 1
  }
}

// Returns a 429 when either the IP or the email bucket is exhausted, else null
// (consuming both). Call once per login attempt, before touching the database.
export function checkLoginLimit(ip: string, email: string): RouteResult | null {
  const now = Date.now()
  prune(loginIpWindows, now, LOGIN_WINDOW_MS)
  prune(loginEmailWindows, now, LOGIN_WINDOW_MS)

  const blocked =
    isOverLimit(loginIpWindows, ip, now, LOGIN_WINDOW_MS, LOGIN_LIMIT) ||
    isOverLimit(loginEmailWindows, email, now, LOGIN_WINDOW_MS, LOGIN_LIMIT)
  if (blocked) {
    return {
      status: 429,
      body: { error: 'Too many login attempts — wait 15 minutes and try again.' },
    }
  }

  consume(loginIpWindows, ip, now, LOGIN_WINDOW_MS)
  consume(loginEmailWindows, email, now, LOGIN_WINDOW_MS)
  return null
}

// Called only after a password actually verifies, so a legitimate user who
// signs in (with or without a few typos first) isn't locked out of their own
// account minutes later. A brute-force run never reaches this, since it never
// produces a correct password. Clearing is scoped to the email that just
// succeeded, so an attacker who owns one valid account still can't reset the
// victim's email bucket by logging into their own.
export function clearLoginLimit(ip: string, email: string): void {
  loginIpWindows.delete(ip)
  loginEmailWindows.delete(email)
}

export function checkSignupLimit(ip: string): RouteResult | null {
  const now = Date.now()
  prune(signupIpWindows, now, SIGNUP_WINDOW_MS)

  if (isOverLimit(signupIpWindows, ip, now, SIGNUP_WINDOW_MS, SIGNUP_LIMIT)) {
    return {
      status: 429,
      body: { error: 'Too many signup attempts — wait an hour and try again.' },
    }
  }

  consume(signupIpWindows, ip, now, SIGNUP_WINDOW_MS)
  return null
}
