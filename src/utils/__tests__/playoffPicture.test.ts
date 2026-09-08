import { describe, expect, it } from 'vitest'
import type { DivisionLeaderRecord, WildCardRecord } from '../../types/mlb'
import {
  BRACKET,
  BRACKET_COLUMNS,
  BRACKET_ROWS,
  BRACKET_WIDTH,
  buildPlayoffPicture,
  byRecord,
  DIVISION_NAMES,
  divisionName,
  mirrorX,
  seedOf,
} from '../playoffPicture'

const PHILLIES = 143

function leader(
  id: number,
  name: string,
  wins: number,
  losses: number,
  division = { id: 204, name: 'NL East' },
  extra: Partial<DivisionLeaderRecord> = {}
): DivisionLeaderRecord {
  return {
    team: { id, name, division },
    wins,
    losses,
    gamesBack: '-',
    divisionRank: '1',
    divisionLeader: true,
    ...extra,
  }
}

function wildCard(
  id: number,
  teamName: string,
  wins: number,
  losses: number,
  gamesBack: string,
  extra: Partial<WildCardRecord> = {}
): WildCardRecord {
  return {
    team: { id, name: `Full ${teamName}`, teamName },
    wins,
    losses,
    wildCardRank: '1',
    wildCardGamesBack: gamesBack,
    ...extra,
  }
}

/** The real 2026-09-08 field, which is what the design was measured against. */
const LEADERS = [
  leader(158, 'Brewers', 89, 56, { id: 205, name: 'NL Central' }),
  leader(119, 'Dodgers', 87, 57, { id: 203, name: 'NL West' }),
  leader(144, 'Braves', 85, 59, { id: 204, name: 'NL East' }),
]
const WILD_CARD = [
  wildCard(PHILLIES, 'Phillies', 81, 63, '+4.5'),
  wildCard(112, 'Cubs', 81, 64, '+4.0'),
  wildCard(109, 'D-backs', 77, 68, '-'),
  wildCard(135, 'Padres', 76, 68, '0.5'),
  wildCard(146, 'Marlins', 72, 73, '5.0'),
]

describe('byRecord', () => {
  it('orders by winning percentage, not by wins', () => {
    // 80-60 (.571) is a better club than 82-64 (.562) despite the extra wins.
    const ordered = byRecord([
      { id: 'more wins', wins: 82, losses: 64 },
      { id: 'better pct', wins: 80, losses: 60 },
    ])
    expect(ordered.map(r => r.id)).toEqual(['better pct', 'more wins'])
  })

  it('leaves the input array untouched', () => {
    const input = [{ wins: 70, losses: 70 }, { wins: 90, losses: 50 }]
    byRecord(input)
    expect(input[0].wins).toBe(70)
  })

  it('survives an 0-0 opening day', () => {
    expect(byRecord([{ wins: 0, losses: 0 }, { wins: 0, losses: 0 }])).toHaveLength(2)
  })
})

describe('buildPlayoffPicture', () => {
  it('seeds division winners 1-3 and wild cards 4-6', () => {
    const picture = buildPlayoffPicture(LEADERS, WILD_CARD)!
    expect(picture.byes.map(b => [b.team.seed, b.team.name])).toEqual([
      [1, 'Brewers'],
      [2, 'Dodgers'],
    ])
    expect(picture.series.map(s => [s.higher.seed, s.lower.seed])).toEqual([
      [3, 6],
      [4, 5],
    ])
    expect(picture.series[1].higher.name).toBe('Phillies')
    expect(picture.series[1].lower.name).toBe('Cubs')
  })

  it('THE FORMAT TRAP: a wild card that out-records a division winner still seeds below it', () => {
    // A 95-win wild card behind a 70-win division winner is unusual but legal,
    // and merging the two lists by record would invent a different postseason.
    const weakLeaders = [
      leader(158, 'Brewers', 89, 56, { id: 205, name: 'NL Central' }),
      leader(119, 'Dodgers', 87, 57, { id: 203, name: 'NL West' }),
      leader(144, 'Braves', 70, 75, { id: 204, name: 'NL East' }),
    ]
    const strongWildCard = [
      wildCard(PHILLIES, 'Phillies', 95, 50, '+12.0'),
      ...WILD_CARD.slice(1),
    ]
    const picture = buildPlayoffPicture(weakLeaders, strongWildCard)!

    expect(seedOf(picture, 144)).toBe(3) // the 70-win division winner
    expect(seedOf(picture, PHILLIES)).toBe(4) // the 95-win wild card
    // ...and the weaker club is the one that hosts.
    expect(picture.series[0].higher.teamId).toBe(144)
  })

  it('pairs the byes with the series they wait on, without reseeding', () => {
    const picture = buildPlayoffPicture(LEADERS, WILD_CARD)!
    expect(picture.byes[0].awaits).toEqual([4, 5])
    expect(picture.byes[1].awaits).toEqual([3, 6])
  })

  it('names the first team out', () => {
    const picture = buildPlayoffPicture(LEADERS, WILD_CARD)!
    expect(picture.firstOut).toMatchObject({ name: 'Padres', wins: 76, losses: 68, gamesBack: '0.5' })
  })

  it('has no first team out when the race response holds only the three clubs in', () => {
    expect(buildPlayoffPicture(LEADERS, WILD_CARD.slice(0, 3))!.firstOut).toBeNull()
  })

  it('returns null on an incomplete field', () => {
    expect(buildPlayoffPicture(LEADERS.slice(0, 2), WILD_CARD)).toBeNull()
    expect(buildPlayoffPicture(LEADERS, WILD_CARD.slice(0, 2))).toBeNull()
    expect(buildPlayoffPicture([], [])).toBeNull()
  })

  it('prefers the short club name a wild card response carries under hydrate', () => {
    // hydrate=team(division) swaps `name` to the full club name, so a bracket
    // reading `name` would print "Full Phillies" in a 6-across card.
    const picture = buildPlayoffPicture(LEADERS, WILD_CARD)!
    expect(picture.series[1].higher.name).toBe('Phillies')
    const noShortName = [{ ...WILD_CARD[0], team: { id: PHILLIES, name: 'Philadelphia Phillies' } }, ...WILD_CARD.slice(1)]
    expect(buildPlayoffPicture(LEADERS, noShortName)!.series[1].higher.name).toBe('Philadelphia Phillies')
  })

  it('reads clinch state from the booleans the regularSeason response actually carries', () => {
    // That response has no clinchIndicator letter — only divisionChamp/clinched.
    const clinched = [
      leader(158, 'Brewers', 89, 56, { id: 205, name: 'NL Central' }, { divisionChamp: true }),
      leader(119, 'Dodgers', 87, 57, { id: 203, name: 'NL West' }, { clinched: true }),
      leader(144, 'Braves', 85, 59),
    ]
    const picture = buildPlayoffPicture(clinched, WILD_CARD)!
    expect(picture.byes[0].team.clinch).toBe('z')
    expect(picture.byes[1].team.clinch).toBe('x')
    expect(picture.series[0].higher.clinch).toBeNull()
  })

  it('carries each side of the bracket its own qualifying detail', () => {
    const picture = buildPlayoffPicture(LEADERS, WILD_CARD)!
    expect(picture.byes[0].team).toMatchObject({ berth: 'division', division: 'NL Central', gamesBack: null })
    expect(picture.series[1].higher).toMatchObject({ berth: 'wildCard', division: null, gamesBack: '+4.5' })
  })
})

describe('seedOf', () => {
  it('finds a club anywhere in the field, and reports null for one outside it', () => {
    const picture = buildPlayoffPicture(LEADERS, WILD_CARD)
    expect(seedOf(picture, 158)).toBe(1)
    expect(seedOf(picture, 109)).toBe(6)
    expect(seedOf(picture, 135)).toBeNull() // first team out
    expect(seedOf(null, PHILLIES)).toBeNull()
  })
})

describe('divisionName', () => {
  it('names all six divisions', () => {
    // The standings response carries a division id and no name, so a gap here
    // renders a blank where a division belongs and reports nothing.
    for (const id of [200, 201, 202, 203, 204, 205]) {
      expect(divisionName(id), `division ${id}`).toMatch(/^(AL|NL) (East|Central|West)$/)
    }
    expect(new Set(Object.values(DIVISION_NAMES)).size).toBe(6)
  })

  it('is empty rather than undefined for an id it has never met', () => {
    // A realignment must degrade to a missing label, never to "undefined" printed
    // in the middle of a bracket.
    expect(divisionName(999)).toBe('')
  })
})

describe('bracket geometry', () => {
  const rows = BRACKET_ROWS
  const midpoint = (a: number, b: number) => (a + b) / 2

  it('lands every connector stub on the centre of the box it feeds', () => {
    // Each connector is a bracket spanning two slots whose stub carries the
    // winner into a third. Off-by-a-pixel here is a diagram that looks broken
    // and reports nothing, so the midpoints are asserted rather than eyeballed.
    expect(rows.wildCardWinner[0]).toBe(midpoint(rows.wildCard[0], rows.wildCard[1]))
    expect(rows.wildCardWinner[1]).toBe(midpoint(rows.wildCard[2], rows.wildCard[3]))
    expect(rows.championship[0]).toBe(midpoint(rows.wildCardWinner[0], rows.bye[0]))
    expect(rows.championship[1]).toBe(midpoint(rows.bye[1], rows.wildCardWinner[1]))
    expect(rows.pennant).toBe(midpoint(rows.championship[0], rows.championship[1]))
  })

  it('is symmetric about its own centre line', () => {
    const flip = (y: number) => 2 * rows.centre - y
    expect(rows.wildCard[3]).toBe(flip(rows.wildCard[0]))
    expect(rows.wildCard[2]).toBe(flip(rows.wildCard[1]))
    expect(rows.wildCardWinner[1]).toBe(flip(rows.wildCardWinner[0]))
    expect(rows.bye[1]).toBe(flip(rows.bye[0]))
    expect(rows.championship[1]).toBe(flip(rows.championship[0]))
    expect(rows.pennant).toBe(rows.centre)
  })

  it('keeps every box inside the frame it is drawn in', () => {
    const half = BRACKET.boxHeight / 2
    const every = [
      ...rows.wildCard,
      ...rows.wildCardWinner,
      ...rows.bye,
      ...rows.championship,
      rows.pennant,
    ]
    for (const y of every) {
      expect(y - half, `top of ${y}`).toBeGreaterThanOrEqual(0)
      expect(y + half, `bottom of ${y}`).toBeLessThanOrEqual(rows.height)
    }
  })

  it('never overlaps two boxes in the same column', () => {
    // The Division Series column is the crowded one: a Wild Card winner slot,
    // both byes, and the second winner slot all stack up in it.
    const column = [rows.wildCardWinner[0], rows.bye[0], rows.bye[1], rows.wildCardWinner[1]]
    for (let i = 1; i < column.length; i++) {
      expect(column[i] - column[i - 1]).toBeGreaterThanOrEqual(BRACKET.boxHeight)
    }
  })

  it('fits the widest container it is ever drawn in', () => {
    // The panel sits in <main>'s max-w-7xl (1280px) less its px-4 gutters, and
    // the bracket is a fixed pixel width — so it either fits or it overflows the
    // page. This is the guard on widening a column by eye.
    expect(BRACKET_WIDTH).toBeLessThanOrEqual(1280 - 32)
  })

  it('mirrors a column onto the other league without a second set of constants', () => {
    const { teamWidth, roundWidth } = BRACKET
    expect(mirrorX(BRACKET_COLUMNS.wildCard, teamWidth)).toBe(BRACKET_WIDTH - teamWidth)
    // Round-trips, so the right-hand league is the left one reflected exactly.
    expect(mirrorX(mirrorX(BRACKET_COLUMNS.championship, roundWidth), roundWidth)).toBe(
      BRACKET_COLUMNS.championship
    )
    // The two pennant boxes face each other across the gutter, and nothing else
    // may sit between them.
    const leftPennantRight = BRACKET_COLUMNS.pennant + roundWidth
    expect(mirrorX(BRACKET_COLUMNS.pennant, roundWidth) - leftPennantRight).toBe(
      BRACKET.gutterWidth
    )
  })
})
