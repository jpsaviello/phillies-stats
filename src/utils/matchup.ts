import type { GameLogSplit, PitchingGameStat, RecentForm } from '../types/mlb'
import { eraOver, inningsToOuts, outsToInnings } from './innings'

/**
 * MLB's pitchHand.code as the shorthand a box score would print: LHP/RHP, or
 * "SP" for the rare switch-pitcher (code "S"). Returns null for a missing or
 * unrecognized code so the label is simply omitted rather than shown blank.
 */
export function handLabel(code: string | null | undefined): string | null {
  switch (code) {
    case 'L':
      return 'LHP'
    case 'R':
      return 'RHP'
    case 'S':
      return 'SP'
    default:
      return null
  }
}

/**
 * A starter's last N starts, aggregated.
 *
 * Relief appearances are excluded: a game log mixes them in, and one mop-up
 * inning would count as a "start" and drag the line toward a workload the
 * pitcher never carried in the role we're previewing. gamesStarted is 1 on a
 * start and 0 otherwise; it's optional in the type because the batting side of
 * GameLogSplit has no such field, so an absent value is treated as relief.
 *
 * Splits arrive oldest-first from fetchGameLog, so the most recent starts are
 * at the end. Returns null when the pitcher has no starts at all this season —
 * a reliever making a spot start, or a debut.
 */
export function recentForm(splits: GameLogSplit[], count = 3): RecentForm | null {
  const starts = splits.filter(s => (s.stat as PitchingGameStat).gamesStarted === 1)
  const recent = starts.slice(-count)
  if (recent.length === 0) return null

  let outs = 0
  let earnedRuns = 0
  let strikeOuts = 0
  for (const split of recent) {
    const stat = split.stat as PitchingGameStat
    outs += inningsToOuts(stat.inningsPitched)
    earnedRuns += stat.earnedRuns
    strikeOuts += stat.strikeOuts
  }

  return {
    starts: recent.length,
    inningsPitched: outsToInnings(outs),
    earnedRuns,
    strikeOuts,
    era: eraOver(earnedRuns, outs),
  }
}
