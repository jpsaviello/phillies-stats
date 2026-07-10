import type { GameLogSplit, BattingGameStat, PitchingGameStat } from '../types/mlb'

export interface TrendPoint {
  date: string
  value: number
}

// Plotted ERA is capped so one blowup outing early in the season doesn't
// flatten the rest of the line; running totals stay uncapped.
const ERA_PLOT_CAP = 20

// "6.1" innings pitched means 6 innings plus 1 out (a third of an inning).
function parseInnings(ip: string): number {
  const [whole, outs] = ip.split('.')
  return Number(whole) + Number(outs ?? 0) / 3
}

export function rollingAvg(splits: GameLogSplit[], window = 10): TrendPoint[] {
  const points: TrendPoint[] = []
  for (let i = window - 1; i < splits.length; i++) {
    let hits = 0
    let atBats = 0
    for (let j = i - window + 1; j <= i; j++) {
      const stat = splits[j].stat as BattingGameStat
      hits += stat.hits
      atBats += stat.atBats
    }
    if (atBats > 0) points.push({ date: splits[i].date, value: hits / atBats })
  }
  return points
}

export function cumulativeHomeRuns(splits: GameLogSplit[]): TrendPoint[] {
  let total = 0
  return splits.map(s => {
    total += (s.stat as BattingGameStat).homeRuns
    return { date: s.date, value: total }
  })
}

export function eraProgression(splits: GameLogSplit[]): TrendPoint[] {
  const points: TrendPoint[] = []
  let earnedRuns = 0
  let innings = 0
  for (const s of splits) {
    const stat = s.stat as PitchingGameStat
    earnedRuns += stat.earnedRuns
    innings += parseInnings(stat.inningsPitched)
    if (innings > 0) {
      points.push({ date: s.date, value: Math.min((9 * earnedRuns) / innings, ERA_PLOT_CAP) })
    }
  }
  return points
}

export function strikeoutsPerGame(splits: GameLogSplit[]): TrendPoint[] {
  return splits.map(s => ({ date: s.date, value: (s.stat as PitchingGameStat).strikeOuts }))
}
