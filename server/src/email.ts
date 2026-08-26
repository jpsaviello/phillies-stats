// SendGrid Web API v3 mail sender — plain fetch, no SMTP client dependency,
// matching how chat.ts/core.ts call their external APIs. Key is a runtime env
// var (SENDGRID_API_KEY), same fail-soft pattern as ANTHROPIC_API_KEY/ODDS_API_KEY:
// .env.local locally, a k8s Secret / Vercel env var in prod, optional everywhere.

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send'
const FROM_ADDRESS = 'notifications@allthingsphils.com'
const FROM_NAME = 'Phillies Stats'

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html?: string
  // Extra SMTP headers, used for List-Unsubscribe. Gmail and Outlook surface a
  // native "Unsubscribe" control from these, which keeps a reader who wants out
  // from reaching for "report spam" instead -- the single fastest way to wreck
  // a sending domain's reputation.
  headers?: Record<string, string>
}

export interface SendEmailResult {
  success: boolean
  error?: string
}

export async function sendEmail(message: EmailMessage): Promise<SendEmailResult> {
  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) return { success: false, error: 'email not configured' }

  const res = await fetch(SENDGRID_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: message.to }] }],
      ...(message.headers ? { headers: message.headers } : {}),
      from: { email: FROM_ADDRESS, name: FROM_NAME },
      subject: message.subject,
      // SendGrid requires text/plain before text/html when both are present.
      content: [
        { type: 'text/plain', value: message.text },
        ...(message.html ? [{ type: 'text/html', value: message.html }] : []),
      ],
    }),
  })

  if (res.ok) return { success: true }

  const body = await res.text().catch(() => '')
  return { success: false, error: `SendGrid ${res.status}: ${body}` }
}
