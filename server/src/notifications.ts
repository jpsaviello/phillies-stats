// Daily notification email: the one thing that actually reads the profile
// notification prefs. Assembles today's briefing.json and on-this-day.json --
// the same two static files the cards on the site read -- into a single email
// and sends it to every user who opted in.
//
// Same framework-agnostic contract as auth.ts/profile.ts: plain values in, a
// RouteResult out, no Hono import (see core.ts).
//
// TRIGGER: a Vercel Cron entry in vercel.json hits GET /api/notifications/daily
// once a day, authenticated with CRON_SECRET. That is deliberately not the
// beat-reporter/on-this-day routines calling in: cloud routine environments
// have no secrets store (their variables are readable by anyone using the
// environment, see CLAUDE.md), so a trigger secret parked there would be a
// secret in name only. The cron fires an hour after both routines push, by
// which time Vercel has already deployed the fresh JSON.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Pool } from 'pg'
import type { RouteResult } from './core.js'
import { getPool } from './db.js'
import { sendEmail } from './email.js'
import {
  renderHtml,
  renderText,
  subjectFor,
  type Article,
  type DailyEmailContent,
} from './emailTemplates.js'

const EMAIL_KIND = 'daily'
// SendGrid's free tier allows 100 messages/day. Truncating loudly beats
// half the list silently 403ing partway through a run.
const MAX_RECIPIENTS_PER_RUN = 100
// A claimed-but-failed send is retried by the next run, but only so many
// times -- an address that hard-bounces every day is not going to start
// working, and each attempt burns free-tier quota another user could use.
const MAX_SEND_ATTEMPTS = 3
const UNSUBSCRIBE_TOKEN_BYTES = 24

type UnsubscribeKind = 'daily_briefing' | 'on_this_day' | 'all'

const UNSUBSCRIBE_COLUMNS: Record<UnsubscribeKind, string> = {
  daily_briefing: 'notify_daily_briefing = false',
  on_this_day: 'notify_on_this_day = false',
  all: 'notify_daily_briefing = false, notify_on_this_day = false',
}

// Today in America/New_York, as YYYY-MM-DD. Same idiom as buildSystemPrompt in
// chat.ts and currentSeasonYear in profile.ts: both containers run on a UTC
// clock, and "today" must not roll over at 8 PM ET during a night game.
export function easternToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function longDateLabel(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(parsed)
}

// Constant-time compare over sha256 digests so the two sides are always the
// same length -- timingSafeEqual throws outright on a length mismatch, which
// would itself leak the secret's length.
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

function bearerFrom(authorizationHeader: string | undefined): string {
  if (authorizationHeader === undefined) return ''
  const [scheme, ...rest] = authorizationHeader.split(' ')
  return scheme?.toLowerCase() === 'bearer' ? rest.join(' ').trim() : ''
}

// --- Content ---

interface RawArticle {
  date?: unknown
  historicalDate?: unknown
  headline?: unknown
  recap?: unknown
}

// Stricter than the cards on the site, which tolerate content up to 48h old.
// A card showing yesterday's recap is a stale page; an *email* announcing
// yesterday's game as today's news is wrong in the reader's inbox, where it
// can't be refreshed. If a routine didn't run, that section is simply absent.
function articleFrom(raw: unknown, today: string, wantHistoricalDate: boolean): Article | null {
  const parsed = raw as RawArticle | null | undefined
  if (parsed === null || typeof parsed !== 'object') return null
  if (parsed.date !== today) return null
  if (typeof parsed.headline !== 'string' || parsed.headline.trim().length === 0) return null
  if (!Array.isArray(parsed.recap)) return null
  const recap = parsed.recap.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
  if (recap.length === 0) return null

  const historicalDate =
    wantHistoricalDate && typeof parsed.historicalDate === 'string'
      ? parsed.historicalDate
      : undefined
  return { headline: parsed.headline, recap, historicalDate }
}

async function fetchArticle(
  origin: string,
  file: string,
  today: string,
  wantHistoricalDate: boolean
): Promise<Article | null> {
  try {
    const res = await fetch(`${origin}/${file}`, { cache: 'no-store' })
    if (!res.ok) return null
    return articleFrom(await res.json(), today, wantHistoricalDate)
  } catch (err) {
    console.error(`fetching ${file} failed`, err)
    return null
  }
}

// --- Recipients ---

type RecipientRow = {
  user_id: string
  email: string
  display_name: string | null
  notify_daily_briefing: boolean
  notify_on_this_day: boolean
  unsubscribe_token: string | null
}

// A join, despite this backend's other cross-table reads (getCurrentUser)
// doing two queries: the no-FK convention is about database *constraints*, not
// about never joining, and the alternative here is one query per recipient.
async function listRecipients(pool: Pool): Promise<RecipientRow[]> {
  const rows = await pool.query<RecipientRow>(
    `SELECT p.user_id, u.email, p.display_name, p.notify_daily_briefing,
            p.notify_on_this_day, p.unsubscribe_token
       FROM user_profiles p
       JOIN users u ON u.id = p.user_id
      WHERE p.deleted_at IS NULL
        AND u.deleted_at IS NULL
        AND (p.notify_daily_briefing OR p.notify_on_this_day)
      ORDER BY p.created_at`,
    []
  )
  return rows.rows
}

async function ensureUnsubscribeToken(
  pool: Pool,
  row: RecipientRow
): Promise<string> {
  if (row.unsubscribe_token !== null) return row.unsubscribe_token
  const token = randomBytes(UNSUBSCRIBE_TOKEN_BYTES).toString('hex')
  // The WHERE guard makes this a no-op if a concurrent run already assigned
  // one; RETURNING then comes back empty and the row's existing token is
  // re-read rather than overwritten.
  const updated = await pool.query<{ unsubscribe_token: string }>(
    `UPDATE user_profiles SET unsubscribe_token = $2, updated_at = now()
      WHERE user_id = $1 AND unsubscribe_token IS NULL
      RETURNING unsubscribe_token`,
    [row.user_id, token]
  )
  if (updated.rows[0] !== undefined) return updated.rows[0].unsubscribe_token
  const existing = await pool.query<{ unsubscribe_token: string | null }>(
    'SELECT unsubscribe_token FROM user_profiles WHERE user_id = $1',
    [row.user_id]
  )
  return existing.rows[0]?.unsubscribe_token ?? token
}

// Claims today's send for this user BEFORE any mail goes out, so a second run
// (cron retry, manual curl, both deploy targets firing) finds the unique-index
// conflict and skips rather than sending the same recap twice. Returns false
// when someone else already holds the claim -- or when a previous attempt
// failed too many times to be worth retrying.
async function claimSend(pool: Pool, userId: string, sendDate: string): Promise<boolean> {
  const claimed = await pool.query(
    `INSERT INTO email_sends (user_id, kind, send_date, status)
     VALUES ($1, $2, $3, 'sending')
     ON CONFLICT (user_id, kind, send_date) DO UPDATE SET
       status = 'sending',
       attempts = email_sends.attempts + 1,
       error = NULL,
       updated_at = now()
     WHERE email_sends.status = 'failed' AND email_sends.attempts < $4
     RETURNING id`,
    [userId, EMAIL_KIND, sendDate, MAX_SEND_ATTEMPTS]
  )
  return (claimed.rowCount ?? 0) > 0
}

async function finishSend(
  pool: Pool,
  userId: string,
  sendDate: string,
  error: string | null
): Promise<void> {
  await pool.query(
    `UPDATE email_sends SET status = $4, error = $5, updated_at = now()
      WHERE user_id = $1 AND kind = $2 AND send_date = $3`,
    [userId, EMAIL_KIND, sendDate, error === null ? 'sent' : 'failed', error]
  )
}

// --- Routes ---

export interface DailyRunSummary {
  date: string
  sections: string[]
  eligible: number
  sent: number
  skipped: number
  failed: number
}

/**
 * GET /api/notifications/daily -- the cron entry point.
 *
 * `origin` is where the static content is read from and what the email's links
 * point at: SITE_ORIGIN when set (the canonical domain), otherwise the origin
 * of the incoming request, which on Vercel is the deployment that just shipped
 * the fresh JSON.
 */
export async function runDailyEmails(
  authorizationHeader: string | undefined,
  requestOrigin: string
): Promise<RouteResult> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return { status: 503, body: { error: 'notifications not configured' } }
  }
  const provided = bearerFrom(authorizationHeader)
  if (provided.length === 0 || !secretMatches(provided, cronSecret)) {
    return { status: 401, body: { error: 'unauthorized' } }
  }

  const pool = getPool()
  if (pool === null) return { status: 503, body: { error: 'notifications not configured' } }

  const origin = (process.env.SITE_ORIGIN ?? requestOrigin).replace(/\/+$/, '')
  const today = easternToday()

  const [briefing, onThisDay] = await Promise.all([
    fetchArticle(origin, 'briefing.json', today, false),
    fetchArticle(origin, 'on-this-day.json', today, true),
  ])

  const sections = [
    ...(briefing !== null ? ['briefing'] : []),
    ...(onThisDay !== null ? ['on_this_day'] : []),
  ]
  if (briefing === null && onThisDay === null) {
    // Both routines skipped or failed today. Nothing to say -- and an email
    // that says nothing is worse than no email.
    return {
      status: 200,
      body: { date: today, sections, eligible: 0, sent: 0, skipped: 0, failed: 0 },
    }
  }

  const summary: DailyRunSummary = {
    date: today,
    sections,
    eligible: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  }

  try {
    const recipients = await listRecipients(pool)
    // A user opted into on-this-day only, on a day only the briefing ran, has
    // nothing to receive -- filtered out before the send cap is applied so
    // they don't consume a slot.
    const withContent = recipients.filter(
      row =>
        (row.notify_daily_briefing && briefing !== null) ||
        (row.notify_on_this_day && onThisDay !== null)
    )
    summary.eligible = withContent.length
    if (withContent.length > MAX_RECIPIENTS_PER_RUN) {
      console.warn(
        `daily email: ${withContent.length} eligible recipients exceeds the ${MAX_RECIPIENTS_PER_RUN}/run cap; truncating`
      )
    }

    // Sequential, not Promise.all: the volume is tiny and a burst of parallel
    // SendGrid calls buys nothing but rate-limit risk.
    for (const row of withContent.slice(0, MAX_RECIPIENTS_PER_RUN)) {
      if (!(await claimSend(pool, row.user_id, today))) {
        summary.skipped += 1
        continue
      }

      const token = await ensureUnsubscribeToken(pool, row)
      const content: DailyEmailContent = {
        greetingName: row.display_name,
        dateLabel: longDateLabel(today),
        briefing: row.notify_daily_briefing ? briefing : null,
        onThisDay: row.notify_on_this_day ? onThisDay : null,
        siteUrl: origin,
        unsubscribeUrl: `${origin}/api/notifications/unsubscribe?token=${token}`,
      }

      const result = await sendEmail({
        to: row.email,
        subject: subjectFor(content),
        text: renderText(content),
        html: renderHtml(content),
        headers: {
          'List-Unsubscribe': `<${content.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      })

      await finishSend(pool, row.user_id, today, result.success ? null : result.error ?? 'unknown')
      if (result.success) {
        summary.sent += 1
      } else {
        summary.failed += 1
        console.error(`daily email to user ${row.user_id} failed: ${result.error}`)
      }
    }

    return { status: 200, body: summary }
  } catch (err) {
    console.error('daily email run failed', err)
    return { status: 502, body: { error: 'daily email run failed', partial: summary } }
  }
}

function unsubscribePage(title: string, message: string, siteUrl: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#FAF7F0;">
  <div style="max-width:520px;margin:64px auto;padding:32px;background:#fff;border-radius:12px;">
    <h1 style="margin:0 0 12px;font-size:22px;color:#002D72;">${title}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">${message}</p>
    <a href="${siteUrl}" style="display:inline-block;background:#E81828;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:11px 20px;border-radius:8px;">Back to Phillies Stats</a>
  </div>
</body></html>`
}

function kindFrom(raw: string | undefined): UnsubscribeKind {
  return raw === 'daily_briefing' || raw === 'on_this_day' ? raw : 'all'
}

/**
 * GET/POST /api/notifications/unsubscribe?token=...&kind=...
 *
 * Unauthenticated by design -- it's reached from an email, where the reader
 * has no session and should not need one. The token is 24 bytes of CSPRNG
 * output scoped to a single profile row, so it authorizes exactly one action
 * (turning that user's notification prefs off) and nothing else. POST is
 * accepted as well as GET so Gmail/Outlook's native one-click List-Unsubscribe
 * control works, which keeps an annoyed reader off the "report spam" button.
 */
export async function unsubscribe(
  token: string | undefined,
  kind: string | undefined
): Promise<RouteResult> {
  const siteUrl = (process.env.SITE_ORIGIN ?? '/').replace(/\/+$/, '') || '/'
  const html = (title: string, message: string): RouteResult => ({
    status: 200,
    body: unsubscribePage(title, message, siteUrl),
    contentType: 'text/html; charset=utf-8',
  })

  if (token === undefined || token.length === 0) {
    return html('Link not recognized', 'That unsubscribe link is missing its token.')
  }

  const pool = getPool()
  if (pool === null) {
    return {
      status: 503,
      body: unsubscribePage(
        'Something went wrong',
        "We couldn't reach the database to update your preferences. Please try again later.",
        siteUrl
      ),
      contentType: 'text/html; charset=utf-8',
    }
  }

  try {
    const updated = await pool.query(
      `UPDATE user_profiles SET ${UNSUBSCRIBE_COLUMNS[kindFrom(kind)]}, updated_at = now()
        WHERE unsubscribe_token = $1 AND deleted_at IS NULL`,
      [token]
    )
    if ((updated.rowCount ?? 0) === 0) {
      // Covers an unknown token and a deleted account alike -- deliberately
      // the same message, since this page is reachable by anyone with a URL.
      return html(
        'Link not recognized',
        "That unsubscribe link is no longer valid. If you're still getting emails, sign in and turn notifications off in your profile."
      )
    }
    return html(
      "You're unsubscribed",
      "You won't get any more Phillies Daily emails. You can turn them back on any time from your profile."
    )
  } catch (err) {
    console.error('unsubscribe failed', err)
    return {
      status: 502,
      body: unsubscribePage(
        'Something went wrong',
        "We couldn't update your preferences just now. Please try again later.",
        siteUrl
      ),
      contentType: 'text/html; charset=utf-8',
    }
  }
}
