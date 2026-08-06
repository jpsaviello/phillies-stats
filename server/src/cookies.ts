// Framework-agnostic cookie build/parse for the session cookie — same
// no-Hono-import rule as core.ts (see the comment there for why). Nothing else
// in this backend sets response headers, so this is the only place cookie
// syntax lives.

export const SESSION_COOKIE_NAME = 'session'

export interface CookieOptions {
  // Omit for a session cookie; 0 deletes it now.
  maxAgeSeconds?: number
  secure?: boolean
  sameSite?: 'Lax' | 'Strict' | 'None'
}

export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', `SameSite=${opts.sameSite ?? 'Lax'}`]
  if (opts.secure ?? true) parts.push('Secure')
  if (opts.maxAgeSeconds !== undefined) parts.push(`Max-Age=${opts.maxAgeSeconds}`)
  return parts.join('; ')
}

// x-forwarded-proto is set by the k8s ingress and by Vercel. Deriving Secure
// from the real request scheme rather than hardcoding it: k8s/base/ingress.yaml
// has no TLS section (local Docker Desktop cluster, plain HTTP), and browsers
// drop Secure cookies from non-HTTPS responses entirely — a hardcoded Secure
// would silently make sign-in impossible there while working fine on Vercel.
// This also upgrades itself automatically if TLS is ever added to the ingress.
export function isHttpsFrom(xForwardedProto: string | string[] | undefined): boolean {
  const raw = Array.isArray(xForwardedProto) ? xForwardedProto[0] : xForwardedProto
  return raw?.split(',')[0]?.trim() === 'https'
}

// The Cookie request header is a single "a=1; b=2" string, unlike
// x-forwarded-for's list shape, so there's no array to normalize here.
export function sessionTokenFrom(cookieHeader: string | undefined): string | undefined {
  if (cookieHeader === undefined) return undefined
  for (const pair of cookieHeader.split(';')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    if (pair.slice(0, eq).trim() === SESSION_COOKIE_NAME) {
      const value = pair.slice(eq + 1).trim()
      return value.length > 0 ? value : undefined
    }
  }
  return undefined
}
