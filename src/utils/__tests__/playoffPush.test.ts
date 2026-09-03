import { describe, expect, it } from 'vitest'
import type { RemainingGame, TeamRecord } from '../../types/mlb'
import {
  clinchNumber, cutoffMargin, formatGames, formatPct, gamesBetween,
  ordinal, projectedRecord, splitHomeAway, strengthOfSchedule,
} from '../playoffPush'

const club = (id: number, name: string, wins: number, losses: number) => ({ team: { id, name }, wins, losses })

describe('splitHomeAway', () => {
  it('counts the remaining slate by venue', () => {
    const games: RemainingGame[] = [
      { opponentId: 121, isHome: true }, { opponentId: 121, isHome: true }, { opponentId: 120, isHome: false },
    ]
    expect(splitHomeAway(games)).toEqual({ total: 3, home: 2, away: 1 })
  })

  it('handles a finished season', () => {
    expect(splitHomeAway([])).toEqual({ total: 0, home: 0, away: 0 })
  })
})

describe('strengthOfSchedule', () => {
  const records = new Map<number, TeamRecord>([
    [121, { wins: 90, losses: 60 }], // .600
    [120, { wins: 60, losses: 90 }], // .400
  ])

  it('weights each opponent by how many times they are played', () => {
    // Three games against the .600 club and one against the .400 club is .550,
    // not the .500 an unweighted average of the two clubs would give.
    const games: RemainingGame[] = [
      { opponentId: 121, isHome: true }, { opponentId: 121, isHome: true },
      { opponentId: 121, isHome: false }, { opponentId: 120, isHome: false },
    ]
    expect(strengthOfSchedule(games, records)).toBeCloseTo(0.55, 10)
  })

  it('returns null when any opponent is missing rather than averaging a subset', () => {
    // A number computed from part of the schedule reads as authoritative while
    // being wrong — this is why the remaining-schedule fetch pulls BOTH leagues.
    const withInterleague: RemainingGame[] = [{ opponentId: 121, isHome: true }, { opponentId: 147, isHome: false }]
    expect(strengthOfSchedule(withInterleague, records)).toBeNull()
  })

  it('returns null for an opponent that has played no games', () => {
    expect(strengthOfSchedule([{ opponentId: 999, isHome: true }], new Map([[999, { wins: 0, losses: 0 }]]))).toBeNull()
  })

  it('returns null for an empty slate', () => {
    expect(strengthOfSchedule([], records)).toBeNull()
  })
})

describe('projectedRecord', () => {
  it('carries the season pace across the games left', () => {
    // 81-54 (.600) with 27 to play projects to 97-65.
    expect(projectedRecord(81, 54, 27)).toEqual({ wins: 97, losses: 65, pct: 0.6 })
  })

  it('accounts for every remaining game in the projected losses', () => {
    const projected = projectedRecord(81, 54, 27)
    expect((projected?.wins ?? 0) + (projected?.losses ?? 0)).toBe(81 + 54 + 27)
  })

  it('returns null before a game has been played', () => {
    expect(projectedRecord(0, 0, 162)).toBeNull()
  })
})

describe('gamesBetween', () => {
  it('applies the standard games-back formula', () => {
    // 90-60 over 88-62 is 2.0 games.
    expect(gamesBetween({ wins: 90, losses: 60 }, { wins: 88, losses: 62 })).toBe(2)
  })

  it('counts a half game when games played differ', () => {
    expect(gamesBetween({ wins: 90, losses: 60 }, { wins: 89, losses: 60 })).toBe(0.5)
  })

  it('is zero for identical records', () => {
    expect(gamesBetween({ wins: 64, losses: 58 }, { wins: 64, losses: 58 })).toBe(0)
  })
})

describe('cutoffMargin', () => {
  // Three wild card berths; index decides in/out, so this list must already be
  // tiebreaker-corrected before it gets here.
  const ordered = [
    club(1, 'Cubs', 80, 55), club(2, 'Padres', 78, 57), club(3, 'Mets', 76, 59),
    club(4, 'Phillies', 74, 61), club(5, 'Reds', 70, 65),
  ]

  it('measures a club in a spot against the first club out', () => {
    const margin = cutoffMargin(ordered, 2, 3)
    expect(margin).toMatchObject({ inSpot: true, games: 2, rivalName: 'Phillies' })
  })

  it('measures a club out of a spot against the last berth holder', () => {
    const margin = cutoffMargin(ordered, 3, 3)
    expect(margin).toMatchObject({ inSpot: false, games: 2, rivalName: 'Mets' })
  })

  it('reports a genuine tie as 0.0 out of a spot, not as being in one', () => {
    // On 2026-08-13 the Phillies were tied 64-58 with Arizona and lost the
    // head-to-head. A bare "0.0 back" reads like a rounding artifact, so the
    // caller has to say the tiebreaker is what separates them.
    const tied = [club(1, 'Cubs', 80, 55), club(2, 'Padres', 78, 57), club(3, 'D-backs', 64, 58), club(4, 'Phillies', 64, 58)]
    const margin = cutoffMargin(tied, 3, 3)
    expect(margin).toMatchObject({ inSpot: false, games: 0, rivalName: 'D-backs' })
  })

  it('prefers the short club name when hydration supplied one', () => {
    const hydrated = [{ team: { id: 1, name: 'Chicago Cubs', teamName: 'Cubs' }, wins: 80, losses: 55 }, club(2, 'Padres', 78, 57)]
    expect(cutoffMargin(hydrated, 1, 1)?.rivalName).toBe('Cubs')
  })

  it('returns null for a club absent from the ordering', () => {
    // The Phillies drop out of the wildCard response entirely while they lead
    // the division, which surfaces here as index -1.
    expect(cutoffMargin(ordered, -1, 3)).toBeNull()
    expect(cutoffMargin(ordered, 99, 3)).toBeNull()
  })

  it('returns null when there is no club on the other side of the line', () => {
    expect(cutoffMargin([club(1, 'Cubs', 80, 55)], 0, 3)).toBeNull()
  })
})

describe('clinchNumber', () => {
  it('reads a real figure', () => {
    expect(clinchNumber('12')).toBe(12)
    expect(clinchNumber('0')).toBe(0)
  })

  it('reports MLB\'s not-applicable dash as null rather than NaN', () => {
    // MLB sends the string "-" — not null, not an absent key — for a magic
    // number on a non-leader, and Number('-') is NaN, which renders as such.
    expect(clinchNumber('-')).toBeNull()
    expect(clinchNumber(undefined)).toBeNull()
  })
})

describe('formatting', () => {
  it('drops the leading zero from a rate, as baseball always does', () => {
    expect(formatPct(0.52)).toBe('.520')
    expect(formatPct(0.6)).toBe('.600')
  })

  it('always shows games back to one decimal', () => {
    expect(formatGames(1.5)).toBe('1.5')
    expect(formatGames(0)).toBe('0.0')
  })

  it('ordinalizes, including the teens', () => {
    expect([1, 2, 3, 4].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th'])
    expect([11, 12, 13].map(ordinal)).toEqual(['11th', '12th', '13th'])
    expect([21, 22, 23].map(ordinal)).toEqual(['21st', '22nd', '23rd'])
  })
})
