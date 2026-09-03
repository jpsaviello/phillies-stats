// Pure selection logic for the Today tab. No React and no fetching — same
// posture as bullpen.ts / playoffPush.ts / gameStory.ts, so the cases that are
// awkward to produce in a browser (a game in progress, a postponement sitting
// in the lookback window, an off day) can be exercised without waiting for one
// to actually happen.

import type { Game } from '../api/mlb'

export interface DatedGame {
  game: Game
  date: string
}

/**
 * The game the tab leads with: one in progress if there is one, otherwise the
 * next one not yet started.
 *
 * Live wins because a game being on is the most time-sensitive fact this app
 * holds. The fallback keys on `abstractGameState === 'Preview'` rather than
 * "not Final" for the reason MatchupPreview does: a Postponed game keeps its
 * ORIGINAL gameDate, so a non-Final test would let one from the lookback window
 * sit here presenting itself as tonight's game — and its date would even pass
 * the `>= today` check on the day it was called off.
 *
 * Returns null on an off day with nothing scheduled ahead, which is the panel's
 * cue to render nothing rather than an empty card.
 */
export function pickHeadline(games: DatedGame[], today: string): DatedGame | null {
  const live = games.find(g => g.game.status.abstractGameState === 'Live')
  if (live) return live
  return games.find(g => g.date >= today && g.game.status.abstractGameState === 'Preview') ?? null
}

/**
 * The most recent completed games, newest first.
 *
 * The opposite order to the Schedule tab's list, which reads forward through
 * the season. Here the reader is asking "how have they been playing lately",
 * and the answer starts with last night.
 */
export function recentResults(games: DatedGame[], limit: number): DatedGame[] {
  return games.filter(g => g.game.status.detailedState === 'Final').slice(-limit).reverse()
}

/**
 * Won-lost record over a set of games, from the Phillies' side.
 *
 * Counts wins and subtracts, rather than counting losses separately: a game
 * MLB has marked Final but not yet flagged a winner for would otherwise vanish
 * from both columns and print a record that doesn't add up to the games shown.
 */
export function recordOver(games: DatedGame[], philliesId: number): { wins: number; losses: number } {
  const wins = games.filter(({ game }) => {
    const isHome = game.teams.home.team.id === philliesId
    return (isHome ? game.teams.home : game.teams.away).isWinner === true
  }).length
  return { wins, losses: games.length - wins }
}
