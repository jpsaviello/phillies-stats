// Framework-agnostic spend guard for /api/chat — same no-Hono-import rule as
// core.ts (see the comment there for why). Counters live in module scope, so
// they're a hard guarantee on the long-running k8s process (single replica)
// but best-effort on Vercel (per-instance, reset on cold start) — the same
// accepted tradeoff as the odds cache. The real backstop is the monthly spend
// limit set on the Anthropic key itself.

import type { RouteResult } from './core.js'

const IP_LIMIT = 10
const IP_WINDOW_MS = 15 * 60 * 1000
const DAILY_CAP = 200

const ipWindows = new Map<string, { windowStart: number; count: number }>()
let daily: { day: string; count: number } = { day: '', count: 0 }

// en-CA gives YYYY-MM-DD; ET matches the system-prompt date convention so the
// daily budget rolls over at midnight in Philadelphia, not UTC.
function etDay(now: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(now))
}

// x-forwarded-for is set by the k8s ingress and by Vercel; the first entry is
// the original client. Spoofable when the backend is hit directly (NodePort
// bypass) — accepted, since the global daily cap can't be dodged that way.
export function clientIpFrom(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header
  const first = raw?.split(',')[0]?.trim()
  return first !== undefined && first.length > 0 ? first : 'unknown'
}

// Returns a 429 RouteResult when a limit is hit, or null when the request is
// allowed (in which case both counters are consumed). Callers must invoke this
// exactly once per request, before any paid work.
export function checkChatLimit(ip: string): RouteResult | null {
  const now = Date.now()

  for (const [key, window] of ipWindows) {
    if (now - window.windowStart >= IP_WINDOW_MS) ipWindows.delete(key)
  }

  const today = etDay(now)
  if (daily.day !== today) daily = { day: today, count: 0 }

  const window = ipWindows.get(ip)
  const fresh = window === undefined || now - window.windowStart >= IP_WINDOW_MS
  if (!fresh && window.count >= IP_LIMIT) {
    return {
      status: 429,
      body: { error: "You're sending messages too quickly — wait a few minutes and try again." },
    }
  }
  if (daily.count >= DAILY_CAP) {
    return {
      status: 429,
      body: { error: 'The chat bot has hit its daily limit — try again tomorrow.' },
    }
  }

  if (fresh) {
    ipWindows.set(ip, { windowStart: now, count: 1 })
  } else {
    window.count += 1
  }
  daily.count += 1
  return null
}
