import type { Game } from '../api/mlb'

const ET = 'America/New_York'

// Statuses where gameDate still holds the ORIGINAL slot but the game is not
// happening then. Verified against the 2026 season: a Postponed game keeps its
// gameDate and adds a sibling rescheduleDate, so printing gameDate here would
// state a first pitch that will never occur.
const VOID_STATES = ['Postponed', 'Cancelled', 'Suspended']

export function firstPitch(game: Game): string | null {
  if (game.status.startTimeTBD) return 'TBD'

  if (VOID_STATES.some(s => game.status.detailedState.startsWith(s))) return null

  // Never branch on detailedState === 'Scheduled' — MLB flips it to 'Pre-Game'
  // a few hours before first pitch, and abstractGameState is the only field
  // that keeps both under 'Preview'.
  if (game.status.abstractGameState !== 'Preview') return null

  const d = new Date(game.gameDate)
  if (Number.isNaN(d.getTime())) return null

  let zone = ET
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    // Fail open to ET-assumed (no abbreviation), matching AllStarBanner's
    // fail-open localStorage idiom.
  }

  if (zone === ET) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}
