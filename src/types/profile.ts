// The signed-in user's profile, as the backend exposes it. Every field is
// nullable except the two notification prefs, mirroring server/src/profile.ts's
// DEFAULT_PROFILE (an all-null, both-false row is the normal state for anyone
// who hasn't saved a profile yet — the row is created lazily on first save).
export interface Profile {
  displayName: string | null
  phone: string | null
  location: string | null
  favoritePlayerId: number | null
  favoriteNumber: string | null
  fanSince: number | null
  avatarDataUrl: string | null
  notifyDailyBriefing: boolean
  notifyGameReminders: boolean
}

// The editable field set for POST /api/profile/update — everything in Profile
// except avatarDataUrl, which has its own route and its own validation (see
// the spec's "why the avatar is not in this payload").
export type ProfileUpdate = Omit<Profile, 'avatarDataUrl'>
