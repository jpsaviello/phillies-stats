import type { Favorite } from '../types/favorites'

// Same shape as src/api/auth.ts: bare fetch, credentials: 'include' so the
// httpOnly session cookie rides along, and two-step error handling that prefers
// the backend's { error } message over a generic one.
async function post(path: string, body: unknown): Promise<Favorite[]> {
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
      throw new Error('Your session expired — sign in again to save favorites.')
    }
    if (res.status === 503) {
      throw new Error("Favorites aren't configured right now — try again later.")
    }
    throw new Error(backendError ?? "Couldn't save that — please try again.")
  }
  const data = (await res.json()) as { favorites: Favorite[] }
  return data.favorites
}

// Fails soft to [] on every path, mirroring fetchCurrentUser: this runs on load
// (and again after sign-in), and "couldn't tell" should render as no stars
// rather than an error the user can't act on. A 401 here means the session
// lapsed, which the next /api/me poll already reflects in the header.
export async function fetchFavorites(): Promise<Favorite[]> {
  try {
    const res = await fetch('/api/favorites', { credentials: 'include' })
    if (!res.ok) return []
    const data = (await res.json()) as { favorites: Favorite[] }
    return data.favorites
  } catch {
    return []
  }
}

// Both mutations reject on failure rather than swallowing it — the caller needs
// to know in order to roll its optimistic update back.
export function addFavorite(playerId: number, playerName: string): Promise<Favorite[]> {
  return post('/api/favorites/add', { playerId, playerName })
}

export function removeFavorite(playerId: number): Promise<Favorite[]> {
  return post('/api/favorites/remove', { playerId })
}
