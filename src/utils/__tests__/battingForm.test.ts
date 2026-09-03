import { describe, expect, it } from 'vitest'
import type { BattingStats, Player, WindowBattingStats } from '../../types/mlb'
import { MIN_PLATE_APPEARANCES, TREND_THRESHOLD, buildForms, formatDelta, parseRate } from '../battingForm'

const player = (id: number, fullName: string): Player => ({ id, fullName }) as Player

function windowLine(ops: string, plateAppearances = 40): WindowBattingStats {
  return {
    gamesPlayed: 12, atBats: 38, hits: 12, homeRuns: 3, rbi: 9, avg: '.316', ops, plateAppearances,
  } as WindowBattingStats
}

const seasonLine = (ops: string) => ({ ops }) as BattingStats

describe('parseRate', () => {
  it('reads MLB rate strings, leading dot and all', () => {
    expect(parseRate('.286')).toBeCloseTo(0.286)
    expect(parseRate('1.171')).toBeCloseTo(1.171)
  })

  it('reports the empty-sample form as null rather than NaN', () => {
    // MLB sends ".---" for a player with no plate appearances; parseFloat gives
    // NaN, which would silently poison every comparison downstream.
    expect(parseRate('.---')).toBeNull()
    expect(parseRate(undefined)).toBeNull()
  })
})

describe('buildForms', () => {
  it('gates out hitters below the plate-appearance floor', () => {
    // Below the gate the panel fills with pitchers who took one at-bat, every
    // one rendered as a .000 hitter.
    const forms = buildForms(
      [
        { player: player(1, 'Bryce Harper'), stat: windowLine('.900', MIN_PLATE_APPEARANCES) },
        { player: player(2, 'Cristopher Sánchez'), stat: windowLine('.000', MIN_PLATE_APPEARANCES - 1) },
      ],
      [{ player: player(1, 'Bryce Harper'), stat: seasonLine('.800') }]
    )
    expect(forms.map(f => f.playerId)).toEqual([1])
  })

  it('sorts by window OPS descending', () => {
    const forms = buildForms(
      [
        { player: player(1, 'A'), stat: windowLine('.700') },
        { player: player(2, 'B'), stat: windowLine('1.100') },
        { player: player(3, 'C'), stat: windowLine('.900') },
      ],
      []
    )
    expect(forms.map(f => f.playerId)).toEqual([2, 3, 1])
  })

  it('classifies a hitter exactly at the threshold as heating up', () => {
    // .872 - .772 is exactly .100, but in binary floating point it lands a hair
    // under — which put a row printed "+.100" under "Holding steady" while the
    // footnote said .100 groups it as hot. Rounding at classification time is
    // what makes the printed number and the group agree.
    const forms = buildForms(
      [{ player: player(1, 'Bryce Harper'), stat: windowLine('.872') }],
      [{ player: player(1, 'Bryce Harper'), stat: seasonLine('.772') }]
    )
    expect(forms[0].opsDelta).toBe(TREND_THRESHOLD)
    expect(forms[0].trend).toBe('hot')
    expect(formatDelta(forms[0].opsDelta)).toBe('+.100')
  })

  it('classifies a symmetric drop as cooling off', () => {
    const forms = buildForms(
      [{ player: player(1, 'Nick Castellanos'), stat: windowLine('.672') }],
      [{ player: player(1, 'Nick Castellanos'), stat: seasonLine('.772') }]
    )
    expect(forms[0].trend).toBe('cold')
    expect(formatDelta(forms[0].opsDelta)).toBe('−.100')
  })

  it('calls a small gap steady', () => {
    const forms = buildForms(
      [{ player: player(1, 'Trea Turner'), stat: windowLine('.800') }],
      [{ player: player(1, 'Trea Turner'), stat: seasonLine('.772') }]
    )
    expect(forms[0].trend).toBe('steady')
  })

  it('reports unknown, not steady, when the season baseline has not loaded', () => {
    // seasonSplits is routinely still empty on first render. A hitter with no
    // baseline is not a hitter who is holding steady.
    const forms = buildForms([{ player: player(1, 'Alec Bohm'), stat: windowLine('.900') }], [])
    expect(forms[0].trend).toBe('unknown')
    expect(forms[0].opsDelta).toBeNull()
    expect(forms[0].seasonOps).toBeNull()
  })

  it('carries the window line through unchanged for display', () => {
    const forms = buildForms([{ player: player(1, 'Bryce Harper'), stat: windowLine('.900') }], [])
    expect(forms[0]).toMatchObject({ name: 'Bryce Harper', games: 12, atBats: 38, hits: 12, homeRuns: 3, rbi: 9, avg: '.316', ops: '.900' })
  })
})

describe('formatDelta', () => {
  it('uses baseball notation: signed, three decimals, no leading zero', () => {
    expect(formatDelta(0.243)).toBe('+.243')
    expect(formatDelta(-0.187)).toBe('−.187')
    expect(formatDelta(0)).toBe('+.000')
  })

  it('uses a true minus sign so a column of deltas stays aligned', () => {
    // U+2212, not a hyphen — it matches the digit width of tabular-nums.
    expect(formatDelta(-0.187)?.startsWith('−')).toBe(true)
  })

  it('returns null when there is no delta to show', () => {
    expect(formatDelta(null)).toBeNull()
  })
})
