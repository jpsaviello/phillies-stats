import type { RemainingGame, TeamRecord } from '../types/mlb'

/**
 * Pure arithmetic behind the Playoff Push panel. Everything here is something a
 * fan could redo by hand from the same numbers — no simulation, no probability.
 * Kept free of React and fetching so the awkward cases (ties at the cutoff, a
 * finished season, interleague opponents) can be reasoned about in isolation.
 */

export function splitHomeAway(games: RemainingGame[]) {
  const home = games.filter(g => g.isHome).length
  return { total: games.length, home, away: games.length - home }
}

/**
 * Mean winning percentage of the clubs left on the schedule, weighted by how
 * many times each is played (7 games against a .603 club should count 7 times).
 *
 * Returns null if ANY opponent is missing from the map rather than silently
 * averaging a subset — a strength-of-schedule number computed from part of the
 * schedule reads as authoritative while being wrong.
 */
export function strengthOfSchedule(
  games: RemainingGame[],
  records: Map<number, TeamRecord>
): number | null {
  if (!games.length) return null

  let total = 0
  for (const game of games) {
    const record = records.get(game.opponentId)
    if (!record) return null
    const played = record.wins + record.losses
    if (played === 0) return null
    total += record.wins / played
  }
  return total / games.length
}

/** Season winning percentage carried across the games still to play. */
export function projectedRecord(wins: number, losses: number, remaining: number) {
  const played = wins + losses
  if (played === 0) return null
  const pct = wins / played
  const projectedWins = Math.round(wins + pct * remaining)
  return { wins: projectedWins, losses: played + remaining - projectedWins, pct }
}

/** Standard games-back formula: how far `behind` trails `ahead`. */
export function gamesBetween(ahead: TeamRecord, behind: TeamRecord) {
  return (ahead.wins - behind.wins + (behind.losses - ahead.losses)) / 2
}

export interface CutoffMargin {
  /** True when the club currently occupies one of the wild card berths. */
  inSpot: boolean
  /** Games up on the first club out, or games back of the final berth. */
  games: number
  /** The club being measured against — the first team out, or the berth holder. */
  rivalName: string
}

/**
 * Margin between a club and the playoff cutoff line.
 *
 * `ordered` must already be tiebreaker-corrected (see utils/tiebreakers.ts); the
 * index decides in/out, so passing MLB's raw wildCardRank order here would put
 * the club on the wrong side of the line whenever a tie exists.
 *
 * Note `games` can legitimately be 0 while `inSpot` is false — clubs tied on
 * record are separated by a tiebreaker, not by a game. Callers must say so
 * rather than rendering a bare "0.0 back", which reads like a rounding artifact.
 */
export function cutoffMargin<T extends { team: { id: number; name: string; teamName?: string } } & TeamRecord>(
  ordered: T[],
  index: number,
  spots: number
): CutoffMargin | null {
  if (index < 0 || index >= ordered.length) return null
  const club = ordered[index]
  const inSpot = index < spots

  // In a spot → measure against the first club out. Out of a spot → measure
  // against the club holding the last berth.
  const rival = inSpot ? ordered[spots] : ordered[spots - 1]
  if (!rival) return null

  return {
    inSpot,
    games: Math.abs(gamesBetween(inSpot ? club : rival, inSpot ? rival : club)),
    rivalName: rival.team.teamName ?? rival.team.name,
  }
}

export function ordinal(n: number) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/**
 * MLB sends "-" for a clinch figure that doesn't apply (a magic number for a
 * club that isn't leading, an elimination number for one already clinched), so
 * a plain Number() would yield NaN and render as such.
 */
export function clinchNumber(value: string | undefined): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** ".520" — the leading zero is dropped, as baseball rates always are. */
export function formatPct(value: number) {
  return value.toFixed(3).replace(/^0/, '')
}

/** "1.5" / "0.0" — GB is always shown to one decimal. */
export function formatGames(value: number) {
  return value.toFixed(1)
}
