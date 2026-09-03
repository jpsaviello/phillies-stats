import { describe, expect, it } from 'vitest'
import type { GameLogSplit, PitchingGameStat } from '../../types/mlb'
import { handLabel, recentForm } from '../matchup'

function outing(date: string, stat: Partial<PitchingGameStat> & { gamesStarted?: number }): GameLogSplit {
  return {
    date,
    opponent: { id: 121, name: 'New York Mets' },
    isHome: true,
    stat: { inningsPitched: '6.0', hits: 4, runs: 2, earnedRuns: 2, baseOnBalls: 1, strikeOuts: 7, ...stat },
  }
}

describe('handLabel', () => {
  it('renders the shorthand a box score would print', () => {
    expect(handLabel('L')).toBe('LHP')
    expect(handLabel('R')).toBe('RHP')
  })

  it('handles the rare switch-pitcher', () => {
    expect(handLabel('S')).toBe('SP')
  })

  it('omits the label rather than rendering blank for a missing code', () => {
    expect(handLabel(undefined)).toBeNull()
    expect(handLabel(null)).toBeNull()
    expect(handLabel('X')).toBeNull()
  })
})

describe('recentForm', () => {
  it('aggregates the last three starts', () => {
    const log = [
      outing('2026-08-20', { gamesStarted: 1, inningsPitched: '5.0', earnedRuns: 4, strikeOuts: 5 }),
      outing('2026-08-26', { gamesStarted: 1, inningsPitched: '6.1', earnedRuns: 1, strikeOuts: 8 }),
      outing('2026-09-01', { gamesStarted: 1, inningsPitched: '7.0', earnedRuns: 2, strikeOuts: 9 }),
    ]
    expect(recentForm(log)).toEqual({ starts: 3, inningsPitched: '18.1', earnedRuns: 7, strikeOuts: 22, era: '3.44' })
  })

  it('takes the most recent starts, since the log arrives oldest-first', () => {
    // fetchGameLog passes MLB's chronological order through unchanged, so the
    // newest starts are at the END. Slicing from the front would report a
    // pitcher's April.
    const log = [
      outing('2026-04-05', { gamesStarted: 1, earnedRuns: 9, strikeOuts: 1 }),
      outing('2026-08-26', { gamesStarted: 1, earnedRuns: 1, strikeOuts: 8 }),
      outing('2026-09-01', { gamesStarted: 1, earnedRuns: 0, strikeOuts: 9 }),
    ]
    expect(recentForm(log, 2)?.earnedRuns).toBe(1)
  })

  it('excludes relief appearances', () => {
    // A game log mixes them in, and one mop-up inning counted as a "start"
    // misrepresents the workload in the role being previewed.
    const log = [
      outing('2026-08-26', { gamesStarted: 1, inningsPitched: '6.0', earnedRuns: 2, strikeOuts: 7 }),
      outing('2026-08-30', { gamesStarted: 0, inningsPitched: '1.0', earnedRuns: 0, strikeOuts: 1 }),
    ]
    const form = recentForm(log, 3)
    expect(form?.starts).toBe(1)
    expect(form?.inningsPitched).toBe('6.0')
  })

  it('treats an absent gamesStarted as relief', () => {
    // The field is optional because the batting side of GameLogSplit has no
    // such key at all.
    expect(recentForm([outing('2026-08-26', {})])).toBeNull()
  })

  it('sums innings through outs, not as decimals', () => {
    // 5.2 + 5.2 is 11.1. Float addition gives 11.4, an inning count that cannot
    // exist.
    const log = [
      outing('2026-08-26', { gamesStarted: 1, inningsPitched: '5.2' }),
      outing('2026-09-01', { gamesStarted: 1, inningsPitched: '5.2' }),
    ]
    expect(recentForm(log)?.inningsPitched).toBe('11.1')
  })

  it('computes span ERA from outs rather than averaging game ERAs', () => {
    // 3 earned over 12.0 innings is 2.25 — averaging the two games' ERAs (0.00
    // and 4.50) would also give 2.25 only by coincidence, so the second game
    // here is a different length to make the two methods disagree.
    const log = [
      outing('2026-08-26', { gamesStarted: 1, inningsPitched: '9.0', earnedRuns: 0 }),
      outing('2026-09-01', { gamesStarted: 1, inningsPitched: '3.0', earnedRuns: 3 }),
    ]
    expect(recentForm(log)?.era).toBe('2.25')
  })

  it('reports a shorter span honestly when there are fewer starts than asked for', () => {
    expect(recentForm([outing('2026-09-01', { gamesStarted: 1 })], 3)?.starts).toBe(1)
  })

  it('returns null for a pitcher with no starts at all', () => {
    // A reliever, or a debut — the panel renders TBA rather than a zero line.
    expect(recentForm([], 3)).toBeNull()
    expect(recentForm([outing('2026-09-01', { gamesStarted: 0 })], 3)).toBeNull()
  })
})
