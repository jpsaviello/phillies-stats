import type { User } from '../types/auth'
import type { Profile } from '../types/profile'

// Shared by AuthWidget's header trigger and ProfileModal's avatar fallback,
// so the two can never disagree on what a signed-in user's initials are.
export function profileInitials(profile: Profile | null, user: User): string {
  const name = profile?.displayName?.trim()
  if (name) {
    const parts = name.split(/\s+/)
    const first = parts[0]?.[0] ?? ''
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
    return (first + last).toUpperCase() || '?'
  }
  return user.email[0]?.toUpperCase() ?? '?'
}
