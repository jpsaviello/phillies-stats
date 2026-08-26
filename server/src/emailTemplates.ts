// Plain-text and HTML bodies for the daily notification email. Kept out of
// notifications.ts so that file stays about *who gets mailed and when*, not
// markup. Framework-agnostic, no Hono import (see core.ts).
//
// Everything here is hand-built string concatenation with escaped
// interpolation -- no template engine, matching this repo's no-dependency
// habit. The HTML deliberately uses inline styles and a single centered
// table: Gmail strips <style> blocks in some clients and Outlook ignores most
// modern CSS, so inline attributes on simple elements is the only styling that
// survives everywhere.

export interface Article {
  headline: string
  recap: string[]
  // Only set for "on this day" -- the date the game was actually played, which
  // is decades in the past by design. Never the day the card was written.
  historicalDate?: string
}

export interface DailyEmailContent {
  greetingName: string | null
  dateLabel: string
  briefing: Article | null
  onThisDay: Article | null
  siteUrl: string
  unsubscribeUrl: string
}

const NAVY = '#002D72'
const RED = '#E81828'
const CREAM = '#FAF7F0'

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// "1970-08-25" -> "August 25, 1970". Anchored at noon UTC for the same reason
// src/utils/date.ts's formatDate is: a bare YYYY-MM-DD parses as UTC midnight,
// which renders as the previous day for every timezone west of Greenwich.
function formatLongDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

export function subjectFor(content: DailyEmailContent): string {
  // The briefing is the lead when it exists -- it's the news. On-this-day only
  // supplies the subject when it's the reader's sole opt-in (or the briefing
  // didn't run today), because a decades-old headline as the subject line of a
  // daily email reads like a mistake when today's game is also inside.
  const lead = content.briefing ?? content.onThisDay
  return lead === null ? `Phillies Daily — ${content.dateLabel}` : lead.headline
}

function textArticle(article: Article, title: string): string {
  const dateLine =
    article.historicalDate !== undefined ? `${formatLongDate(article.historicalDate)}\n` : ''
  return [
    title.toUpperCase(),
    dateLine + article.headline,
    '',
    article.recap.join('\n\n'),
  ].join('\n')
}

export function renderText(content: DailyEmailContent): string {
  const greeting =
    content.greetingName !== null ? `Hi ${content.greetingName},` : 'Hi,'
  const sections: string[] = []
  if (content.briefing !== null) sections.push(textArticle(content.briefing, "Today's briefing"))
  if (content.onThisDay !== null) sections.push(textArticle(content.onThisDay, 'On this day'))

  return [
    `PHILLIES DAILY — ${content.dateLabel}`,
    '',
    greeting,
    '',
    sections.join('\n\n----------\n\n'),
    '',
    '----------',
    `More stats, standings, and odds: ${content.siteUrl}`,
    `Unsubscribe: ${content.unsubscribeUrl}`,
  ].join('\n')
}

function htmlArticle(article: Article, title: string): string {
  const dateLine =
    article.historicalDate !== undefined
      ? `<p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${RED};font-weight:700;">${escapeHtml(formatLongDate(article.historicalDate))}</p>`
      : ''
  const paragraphs = article.recap
    .map(
      p =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1f2937;">${escapeHtml(p)}</p>`
    )
    .join('')
  return `
    <tr><td style="padding:24px 28px 0;">
      <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;font-weight:700;">${escapeHtml(title)}</p>
      ${dateLine}
      <h2 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:${NAVY};">${escapeHtml(article.headline)}</h2>
      ${paragraphs}
    </td></tr>`
}

export function renderHtml(content: DailyEmailContent): string {
  const greeting = content.greetingName !== null ? `Hi ${escapeHtml(content.greetingName)},` : 'Hi,'
  const articles = [
    content.briefing !== null ? htmlArticle(content.briefing, "Today's briefing") : '',
    content.onThisDay !== null ? htmlArticle(content.onThisDay, 'On this day') : '',
  ].join('')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subjectFor(content))}</title></head>
<body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        <tr><td style="background:${NAVY};padding:18px 28px;">
          <p style="margin:0;font-size:20px;font-weight:800;letter-spacing:0.04em;color:#ffffff;">PHILLIES DAILY</p>
          <p style="margin:4px 0 0;font-size:13px;color:#c7d2e6;">${escapeHtml(content.dateLabel)}</p>
        </td></tr>
        <tr><td style="padding:22px 28px 0;">
          <p style="margin:0;font-size:15px;color:#1f2937;">${greeting}</p>
        </td></tr>
        ${articles}
        <tr><td style="padding:8px 28px 26px;">
          <a href="${escapeHtml(content.siteUrl)}" style="display:inline-block;background:${RED};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:11px 20px;border-radius:8px;">See the full stats page</a>
        </td></tr>
        <tr><td style="border-top:1px solid #e5e7eb;padding:16px 28px 22px;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;">
            You're getting this because you turned on email notifications in your Phillies Stats profile.<br>
            <a href="${escapeHtml(content.unsubscribeUrl)}" style="color:#6b7280;">Unsubscribe</a> &middot;
            <a href="${escapeHtml(content.siteUrl)}" style="color:#6b7280;">Manage preferences</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
