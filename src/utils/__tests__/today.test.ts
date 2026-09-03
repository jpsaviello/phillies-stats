import { describe, expect, it } from 'vitest'
import type { Game } from '../../api/mlb'
import type { DatedGame } from '../today'
import { pickHeadline, recentResults, recordOver } from '../today'

const PHILLIES = 143
const TODAY = '2026-09-03'

interface Options {
  abstract?: string
  detailed?: string
  home?: boolean
  philliesScore?: number
  oppScore?: number
  won?: boolean
  gamePk?: number
}

function dated(date: string, o: Options = {}): DatedGame {
  const { abstract = 'Preview', detailed = 'Scheduled', home = true, philliesScore, oppScore, won, gamePk = 1 } = o
  const phillies = { team: { id: PHILLIES, name: 'Philadelphia Phillies' }, score: philliesScore, isWinner: won }
  const opponent = { team: { id: 121, name: 'New York Mets' }, score: oppScore, isWinner: won === undefined ? undefined : !won }
  const game: Game = {
    gamePk,
    gameDate: `${date}T22:45:00Z`,
    status: { abstractGameState: abstract, detailedState: detailed },
    teams: home ? { home: phillies, away: opponent } : { home: opponent, away: phillies },
  }
  return { game, date }
}

const final = (date: string, won: boolean, gamePk = 1) =>
  dated(date, { abstract: 'Final', detailed: 'Final', won, philliesScore: won ? 5 : 1, oppScore: won ? 1 : 5, gamePk })

describe('pickHeadline', () => {
  it('leads with a game in progress', () => {
    // The branch that cannot be produced on demand in a browser: there has to
    // be an actual game on. A game being live is the most time-sensitive fact
    // this app holds, so it outranks anything scheduled.
    const games = [
      final('2026-09-02', false),
      dated(TODAY, { abstract: 'Live', detailed: 'In Progress', gamePk: 2 }),
      dated('2026-09-04', { gamePk: 3 }),
    ]
    expect(pickHeadline(games, TODAY)?.game.gamePk).toBe(2)
  })

  it('prefers a live game even when it is dated yesterday', () => {
    // A night game that started before midnight keeps its officialDate on the
    // day it started, so it is still live while carrying yesterday's date.
    const games = [
      dated('2026-09-02', { abstract: 'Live', detailed: 'In Progress', gamePk: 2 }),
      dated('2026-09-04', { gamePk: 3 }),
    ]
    expect(pickHeadline(games, TODAY)?.game.gamePk).toBe(2)
  })

  it('falls back to the next scheduled game', () => {
    const games = [final('2026-09-02', true), dated('2026-09-04', { gamePk: 3 })]
    expect(pickHeadline(games, TODAY)?.game.gamePk).toBe(3)
  })

  it('takes today\'s game over a later one', () => {
    const games = [dated(TODAY, { gamePk: 2 }), dated('2026-09-05', { gamePk: 3 })]
    expect(pickHeadline(games, TODAY)?.game.gamePk).toBe(2)
  })

  it('still leads with a scheduled game once MLB flips it to Pre-Game', () => {
    // abstractGameState keeps Scheduled, Pre-Game and Warmup all under
    // 'Preview'; a detailedState check would drop the game hours before it
    // started, which is exactly when a fan is looking.
    const games = [dated(TODAY, { detailed: 'Pre-Game', gamePk: 2 })]
    expect(pickHeadline(games, TODAY)?.game.gamePk).toBe(2)
  })

  it('ignores a postponed game even when it is dated today', () => {
    // A postponed game keeps its ORIGINAL gameDate, so a "not Final" test would
    // let it sit in the headline presenting itself as tonight's game — and on
    // the day it was called off, its date passes the >= today check too.
    const games = [
      dated(TODAY, { abstract: 'Final', detailed: 'Postponed', gamePk: 2 }),
      dated('2026-09-05', { gamePk: 3 }),
    ]
    expect(pickHeadline(games, TODAY)?.game.gamePk).toBe(3)
  })

  it('ignores a game already played', () => {
    const games = [final('2026-09-02', true, 2)]
    expect(pickHeadline(games, TODAY)).toBeNull()
  })

  it('returns null on an off day with nothing ahead', () => {
    expect(pickHeadline([], TODAY)).toBeNull()
  })
})

describe('recentResults', () => {
  const games = [
    final('2026-08-30', true, 1),
    final('2026-08-31', false, 2),
    final('2026-09-02', true, 3),
    dated('2026-09-04', { gamePk: 4 }),
  ]

  it('returns completed games newest first', () => {
    expect(recentResults(games, 10).map(g => g.game.gamePk)).toEqual([3, 2, 1])
  })

  it('excludes anything not yet final', () => {
    expect(recentResults(games, 10).some(g => g.game.gamePk === 4)).toBe(false)
  })

  it('keeps the most recent when the limit bites', () => {
    expect(recentResults(games, 2).map(g => g.game.gamePk)).toEqual([3, 2])
  })

  it('excludes a postponed game, which is not a result', () => {
    const withPpd = [...games, dated('2026-09-01', { abstract: 'Final', detailed: 'Postponed', gamePk: 5 })]
    expect(recentResults(withPpd, 10).some(g => g.game.gamePk === 5)).toBe(false)
  })

  it('handles an empty schedule', () => {
    expect(recentResults([], 10)).toEqual([])
  })
})

describe('recordOver', () => {
  it('counts from the Phillies\' side whether home or away', () => {
    const games = [
      final('2026-09-01', true, 1),
      { ...final('2026-09-02', false, 2), game: { ...final('2026-09-02', false, 2).game, teams: { home: { team: { id: 121, name: 'New York Mets' }, score: 5, isWinner: true }, away: { team: { id: PHILLIES, name: 'Philadelphia Phillies' }, score: 1, isWinner: false } } } },
    ]
    expect(recordOver(games, PHILLIES)).toEqual({ wins: 1, losses: 1 })
  })

  it('adds up to the number of games shown', () => {
    // A Final game MLB hasn't flagged a winner for would otherwise vanish from
    // both columns and print a record that doesn't match the row count.
    const games = [final('2026-09-01', true, 1), dated('2026-09-02', { abstract: 'Final', detailed: 'Final', gamePk: 2 })]
    const record = recordOver(games, PHILLIES)
    expect(record.wins + record.losses).toBe(games.length)
    expect(record).toEqual({ wins: 1, losses: 1 })
  })

  it('is 0-0 for no games', () => {
    expect(recordOver([], PHILLIES)).toEqual({ wins: 0, losses: 0 })
  })
})
