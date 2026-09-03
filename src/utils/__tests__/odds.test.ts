import { describe, expect, it } from 'vitest'
import type { OddsGame } from '../../api/mlb'
import { getPhilliesOdds } from '../odds'

// OddsMarket isn't exported, so the shape is reached through OddsGame. Naming
// it keeps `key` narrowed to its literal union instead of widening to string.
type Market = OddsGame['bookmakers'][number]['markets'][number]

function game(markets: Market[]): OddsGame {
  return {
    id: 'abc123',
    home_team: 'Philadelphia Phillies',
    away_team: 'New York Mets',
    bookmakers: [{ key: 'draftkings', markets }],
  }
}

const h2h: Market = {
  key: 'h2h',
  outcomes: [{ name: 'Philadelphia Phillies', price: -145 }, { name: 'New York Mets', price: 120 }],
}

const spreads: Market = {
  key: 'spreads',
  outcomes: [
    { name: 'Philadelphia Phillies', price: -110, point: -1.5 },
    { name: 'New York Mets', price: -110, point: 1.5 },
  ],
}

describe('getPhilliesOdds', () => {
  it('picks the Phillies side of both markets', () => {
    expect(getPhilliesOdds(game([h2h, spreads]))).toEqual({ ml: -145, rlPoint: -1.5, rlJuice: -110 })
  })

  it('reads the run line as an underdog when the Phillies are getting runs', () => {
    const dog: Market = { key: 'spreads', outcomes: [{ name: 'Philadelphia Phillies', price: -120, point: 1.5 }] }
    expect(getPhilliesOdds(game([h2h, dog]))?.rlPoint).toBe(1.5)
  })

  it('defaults a run line with no point to the standard -1.5', () => {
    const noPoint: Market = { key: 'spreads', outcomes: [{ name: 'Philadelphia Phillies', price: -110 }] }
    expect(getPhilliesOdds(game([h2h, noPoint]))?.rlPoint).toBe(-1.5)
  })

  it('returns null when the moneyline is missing', () => {
    // Odds are decoration on the schedule; a partial book renders nothing
    // rather than a half-priced game.
    expect(getPhilliesOdds(game([spreads]))).toBeNull()
  })

  it('returns null when the run line is missing', () => {
    expect(getPhilliesOdds(game([h2h]))).toBeNull()
  })

  it('returns null when no book priced the game', () => {
    expect(getPhilliesOdds({ ...game([h2h, spreads]), bookmakers: [] })).toBeNull()
  })

  it('returns null when the book priced a game the Phillies are not in', () => {
    // Games are matched to the schedule by team-name pair, so a mismatched
    // book must not be read as if one side were the Phillies.
    const other: Market = {
      key: 'h2h',
      outcomes: [{ name: 'New York Mets', price: -145 }, { name: 'Atlanta Braves', price: 120 }],
    }
    expect(getPhilliesOdds(game([other, spreads]))).toBeNull()
  })
})
