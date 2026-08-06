import type { User } from '../types/auth'

export interface AuthRequest {
  email: string
  password: string
}

// credentials: 'include' is the first cookie-bearing fetch in this app. Every
// deployment target serves the SPA and /api from one origin, so the browser
// default ('same-origin') would already send the session cookie — it's set
// explicitly to make the cookie dependency visible at the call site.
async function postCredentials(path: string, body: AuthRequest): Promise<User> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let backendError: string | undefined
    try {
      const data = (await res.json()) as { error?: string }
      backendError = data.error
    } catch {
      // non-JSON error body; fall through to the generic message
    }
    if (res.status === 503) {
      throw new Error("Sign-in isn't configured right now — try again later.")
    }
    throw new Error(backendError ?? 'Something went wrong — please try again.')
  }
  const data = (await res.json()) as { user: User }
  return data.user
}

export function signup(request: AuthRequest): Promise<User> {
  return postCredentials('/api/signup', request)
}

export function login(request: AuthRequest): Promise<User> {
  return postCredentials('/api/login', request)
}

// The backend always answers 200 and always clears the cookie, so there's
// nothing to branch on; a network failure still ends with the caller dropping
// its local user state.
export async function logout(): Promise<void> {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' })
  } catch {
    // ignore -- the caller signs out locally either way
  }
}

// Fails soft to null on every path, mirroring fetchConfig: this runs on every
// page load, and "couldn't tell" should render as signed-out rather than
// surfacing an error the user can't act on.
export async function fetchCurrentUser(): Promise<User | null> {
  try {
    const res = await fetch('/api/me', { credentials: 'include' })
    if (!res.ok) return null
    const data = (await res.json()) as { user: User | null }
    return data.user
  } catch {
    return null
  }
}
