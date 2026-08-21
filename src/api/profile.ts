import type { Profile, ProfileUpdate } from '../types/profile'

// Same shape as src/api/favorites.ts: bare fetch, credentials: 'include' so
// the httpOnly session cookie rides along, and two-step error handling that
// prefers the backend's { error } message over a generic one.
async function post(path: string, body: unknown): Promise<Profile> {
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
    if (res.status === 401) {
      throw new Error('Your session expired — sign in again to update your profile.')
    }
    if (res.status === 503) {
      throw new Error("Profiles aren't configured right now — try again later.")
    }
    throw new Error(backendError ?? "Couldn't save that — please try again.")
  }
  const data = (await res.json()) as { profile: Profile }
  return data.profile
}

// Fails soft to null on every path, mirroring fetchCurrentUser: this runs on
// load (and again after sign-in), and "couldn't tell" should render as no
// profile rather than an error the user can't act on. A 401 here means the
// session lapsed, which the next /api/me poll already reflects in the header.
export async function fetchProfile(): Promise<Profile | null> {
  try {
    const res = await fetch('/api/profile', { credentials: 'include' })
    if (!res.ok) return null
    const data = (await res.json()) as { profile: Profile }
    return data.profile
  } catch {
    return null
  }
}

// Rejects on failure so the form can surface the backend's message rather than
// silently doing nothing.
export function updateProfile(update: ProfileUpdate): Promise<Profile> {
  return post('/api/profile/update', update)
}

export function updateAvatar(avatarDataUrl: string | null): Promise<Profile> {
  return post('/api/profile/avatar', { avatarDataUrl })
}

// Both account-management calls have their own two-step error handling
// rather than reusing post(): neither returns a Profile, and the 401 case
// here means "wrong current password", not "your session expired" — the
// generic fallback in post() would be misleading for these two.
async function postAccount(path: string, body: unknown): Promise<void> {
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
      throw new Error("Profiles aren't configured right now — try again later.")
    }
    throw new Error(backendError ?? "Couldn't complete that — please try again.")
  }
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return postAccount('/api/profile/password', { currentPassword, newPassword })
}

export function deleteAccount(password: string): Promise<void> {
  return postAccount('/api/profile/delete', { password })
}
