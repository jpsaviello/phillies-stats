import type { GameLogSplit, PitchingGameStat, RecentForm } from '../types/mlb'
import { eraOver, inningsToOuts, outsToInnings } from './innings'

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

/**
 * Which of two ERA strings is better, for the "edge" highlight.
 *
 * Requires BOTH to be real numbers. An unannounced starter, or one whose line
 * failed to load, has no ERA — highlighting the other pitcher as "better" than
 * a blank is a comparison against nothing, and it reads as a claim the data
 * doesn't support. MLB also sends "-.--" for a pitcher who hasn't allowed an
 * earned run, which would parse as NaN and silently win.
 *
 * Returns null when they're equal, so a genuine tie highlights neither.
 */
export function betterEra(left: string | undefined, right: string | undefined): 'left' | 'right' | null {
  const a = Number(left)
  const b = Number(right)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (a === b) return null
  return a < b ? 'left' : 'right'
}
