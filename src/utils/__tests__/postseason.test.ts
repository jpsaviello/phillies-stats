import { describe, expect, it } from 'vitest'
import type { Game } from '../../api/mlb'
import type { PlayoffPicture, SeededTeam } from '../playoffPicture'
import {
  advancing,
  buildLiveLeague,
  buildWorldSeries,
  clubName,
  isClub,
  isMoot,
  scheduleAgrees,
  seriesBetween,
  seriesContext,
  seriesOfGame,
  seriesStatusText,
  viewStatus,
  winsNeeded,
  type Round,
} from '../postseason'

// The real 2026 NL field, from the final standings and MLB's posted schedule.
const MIL = 158
const LAD = 119
const ATL = 144
const SD = 135
const CHC = 112
const PHI = 143
const NYY = 147
/** "ATL/PHI" — the placeholder MLB lists in the NLDS until that series ends. */
const PLACEHOLDER = 5517

const NAMES: Record<number, string> = {
  [MIL]: 'Milwaukee Brewers',
  [LAD]: 'Los Angeles Dodgers',
  [ATL]: 'Atlanta Braves',
  [SD]: 'San Diego Padres',
  [CHC]: 'Chicago Cubs',
  [PHI]: 'Philadelphia Phillies',
  [NYY]: 'New York Yankees',
  [PLACEHOLDER]: 'ATL/PHI',
}

let pk = 1000

/**
 * One schedule game. `winner` makes it Final; omit it for an unplayed game.
 */
function game(
  round: Round,
  away: number,
  home: number,
  number: number,
  opts: { winner?: number; bestOf?: number; state?: string } = {}
): Game {
  const final = opts.winner !== undefined
  return {
    gamePk: pk++,
    gameDate: `2026-10-${String(number).padStart(2, '0')}T23:00:00Z`,
    gameType: round,
    seriesGameNumber: number,
    gamesInSeries: opts.bestOf ?? { F: 3, D: 5, L: 7, W: 7 }[round],
    seriesDescription: round === 'F' ? 'NL Wild Card Series' : undefined,
    status: {
      abstractGameState: opts.state ?? (final ? 'Final' : 'Preview'),
      detailedState: final ? 'Final' : 'Scheduled',
    },
    teams: {
      away: { team: { id: away, name: NAMES[away] }, isWinner: final ? opts.winner === away : undefined },
      home: { team: { id: home, name: NAMES[home] }, isWinner: final ? opts.winner === home : undefined },
    },
  }
}

function seeded(seed: number, teamId: number, name: string): SeededTeam {
  return {
    seed,
    teamId,
    name,
    wins: 90,
    losses: 72,
    berth: seed <= 3 ? 'division' : 'wildCard',
    division: seed <= 3 ? 'NL East' : null,
    gamesBack: null,
    clinch: null,
  }
}

const S = {
  mil: seeded(1, MIL, 'Brewers'),
  lad: seeded(2, LAD, 'Dodgers'),
  atl: seeded(3, ATL, 'Braves'),
  sd: seeded(4, SD, 'Padres'),
  chc: seeded(5, CHC, 'Cubs'),
  phi: seeded(6, PHI, 'Phillies'),
}

/** The same shape buildPlayoffPicture returns: series[0] is 3/6, series[1] 4/5. */
const PICTURE: PlayoffPicture = {
  series: [
    { higher: S.atl, lower: S.phi },
    { higher: S.sd, lower: S.chc },
  ],
  byes: [
    { team: S.mil, awaits: [4, 5] },
    { team: S.lad, awaits: [3, 6] },
  ],
  firstOut: null,
}

/** Both Wild Card Series as posted, nothing played yet. */
function wildCardRound(): Game[] {
  return [1, 2, 3].flatMap(n => [game('F', PHI, ATL, n), game('F', CHC, SD, n)])
}

describe('isClub', () => {
  it('knows the 30 clubs and rejects the schedule placeholders', () => {
    expect(isClub(PHI)).toBe(true)
    expect(isClub(MIL)).toBe(true)
    expect(isClub(PLACEHOLDER)).toBe(false)
    expect(isClub(2711)).toBe(false)
  })
})

describe('winsNeeded', () => {
  it('is a majority of the series length', () => {
    expect(winsNeeded(3)).toBe(2)
    expect(winsNeeded(5)).toBe(3)
    expect(winsNeeded(7)).toBe(4)
  })
})

describe('clubName', () => {
  it('keeps the two-word nicknames whole', () => {
    expect(clubName('Philadelphia Phillies')).toBe('Phillies')
    expect(clubName('Boston Red Sox')).toBe('Red Sox')
    expect(clubName('Chicago White Sox')).toBe('White Sox')
    expect(clubName('Toronto Blue Jays')).toBe('Blue Jays')
    expect(clubName('Athletics')).toBe('Athletics')
  })
})

describe('seriesBetween', () => {
  it('counts wins from Final games only, in either argument order', () => {
    const games = [
      game('F', PHI, ATL, 1, { winner: PHI }),
      game('F', PHI, ATL, 2),
      game('F', PHI, ATL, 3),
    ]
    const s = seriesBetween(games, 'F', PHI, ATL)!
    expect(s.wins).toEqual([1, 0])
    expect(s.winnerId).toBeNull()
    expect(s.next?.seriesGameNumber).toBe(2)
    expect(seriesBetween(games, 'F', ATL, PHI)!.wins).toEqual([0, 1])
  })

  it('decides a best of three at two wins and stops pointing at a next game', () => {
    const games = [
      game('F', PHI, ATL, 1, { winner: PHI }),
      game('F', PHI, ATL, 2, { winner: PHI }),
      game('F', PHI, ATL, 3),
    ]
    const s = seriesBetween(games, 'F', ATL, PHI)!
    expect(s.winnerId).toBe(PHI)
    expect(s.next).toBeNull()
  })

  it("ignores another round's games between the same clubs", () => {
    const games = [game('F', PHI, ATL, 1, { winner: PHI }), game('L', PHI, ATL, 1, { winner: ATL })]
    expect(seriesBetween(games, 'L', PHI, ATL)!.wins).toEqual([0, 1])
  })

  it('returns null when the clubs have no games in that round', () => {
    expect(seriesBetween(wildCardRound(), 'D', PHI, ATL)).toBeNull()
  })

  it('does not credit a Final game MLB has not flagged a winner for', () => {
    const g = game('F', PHI, ATL, 1, { winner: PHI })
    g.teams.away.isWinner = undefined
    expect(seriesBetween([g], 'F', PHI, ATL)!.wins).toEqual([0, 0])
  })
})

describe('seriesOfGame', () => {
  it('is null for a regular-season game and for a placeholder matchup', () => {
    const regular = game('F', PHI, ATL, 1)
    regular.gameType = 'R'
    expect(seriesOfGame(regular, [regular])).toBeNull()
    const ds = game('D', PLACEHOLDER, LAD, 1)
    expect(seriesOfGame(ds, [ds])).toBeNull()
  })
})

describe('isMoot', () => {
  it("drops a swept series' Game 3 until MLB removes it", () => {
    const g3 = game('F', PHI, ATL, 3)
    const games = [game('F', PHI, ATL, 1, { winner: ATL }), game('F', PHI, ATL, 2, { winner: ATL }), g3]
    expect(isMoot(g3, games)).toBe(true)
  })

  it('keeps a Game 3 that is still needed', () => {
    const g3 = game('F', PHI, ATL, 3)
    const games = [game('F', PHI, ATL, 1, { winner: ATL }), game('F', PHI, ATL, 2, { winner: PHI }), g3]
    expect(isMoot(g3, games)).toBe(false)
  })

  it('never calls a game in progress moot', () => {
    const g = game('F', PHI, ATL, 2, { state: 'Live' })
    expect(isMoot(g, [game('F', PHI, ATL, 1, { winner: ATL }), g])).toBe(false)
  })
})

describe('seriesStatusText', () => {
  it('reads from the leader and stays quiet at 0-0', () => {
    expect(seriesStatusText(['Phillies', 'Braves'], [0, 0], false)).toBeNull()
    expect(seriesStatusText(['Phillies', 'Braves'], [1, 1], false)).toBe('Series tied 1–1')
    expect(seriesStatusText(['Phillies', 'Braves'], [1, 2], false)).toBe('Braves lead 2–1')
    expect(seriesStatusText(['Phillies', 'Braves'], [3, 1], true)).toBe('Phillies win 3–1')
  })
})

describe('seriesContext', () => {
  it('states the series going INTO an unplayed game', () => {
    const g2 = game('F', PHI, ATL, 2)
    const games = [game('F', PHI, ATL, 1, { winner: PHI }), g2, game('F', PHI, ATL, 3)]
    const ctx = seriesContext(g2, games, PHI)!
    expect(ctx.roundName).toBe('NL Wild Card Series')
    expect(ctx.gameNumber).toBe(2)
    expect(ctx.status).toBe('Phillies lead 1–0')
    expect(ctx.stakes).toBe('Chance to clinch')
  })

  it('states the series AFTER a Final game, including the one that ends it', () => {
    const g1 = game('F', PHI, ATL, 1, { winner: ATL })
    const g2 = game('F', PHI, ATL, 2, { winner: ATL })
    const games = [g1, g2, game('F', PHI, ATL, 3)]
    expect(seriesContext(g1, games, PHI)!.status).toBe('Braves lead 1–0')
    expect(seriesContext(g2, games, PHI)!.status).toBe('Braves win 2–0')
    expect(seriesContext(g2, games, PHI)!.stakes).toBeNull()
  })

  it('has no status before Game 1', () => {
    const games = wildCardRound()
    const ctx = seriesContext(games[0], games, PHI)!
    expect(ctx.status).toBeNull()
    expect(ctx.stakes).toBeNull()
  })

  it('calls a facing-elimination game from the focus club side', () => {
    const g2 = game('F', PHI, ATL, 2)
    const games = [game('F', PHI, ATL, 1, { winner: ATL }), g2]
    expect(seriesContext(g2, games, PHI)!.stakes).toBe('Elimination game')
    expect(seriesContext(g2, games, ATL)!.stakes).toBe('Chance to clinch')
  })

  it('calls a deciding game winner-take-all for both sides', () => {
    const g3 = game('F', PHI, ATL, 3)
    const games = [game('F', PHI, ATL, 1, { winner: ATL }), game('F', PHI, ATL, 2, { winner: PHI }), g3]
    expect(seriesContext(g3, games, PHI)!.stakes).toBe('Winner take all')
    expect(seriesContext(g3, games, PHI)!.status).toBe('Series tied 1–1')
  })

  it('is null for a regular-season game', () => {
    const g = game('F', PHI, ATL, 1)
    g.gameType = 'R'
    expect(seriesContext(g, [g], PHI)).toBeNull()
  })
})

describe('scheduleAgrees', () => {
  it('accepts the posted field', () => {
    expect(scheduleAgrees(PICTURE, wildCardRound())).toBe(true)
  })

  it('rejects standings that pair clubs MLB is not actually playing', () => {
    // As if our tiebreakers had seeded the Cubs 6th and the Phillies 5th.
    const swapped: PlayoffPicture = {
      ...PICTURE,
      series: [
        { higher: S.atl, lower: S.chc },
        { higher: S.sd, lower: S.phi },
      ],
    }
    expect(scheduleAgrees(swapped, wildCardRound())).toBe(false)
  })

  it('rejects a schedule with only placeholders — the regular season', () => {
    expect(scheduleAgrees(PICTURE, [game('D', PLACEHOLDER, LAD, 1)])).toBe(false)
  })
})

describe('buildLiveLeague', () => {
  it('is null without a picture or when the schedule disagrees', () => {
    expect(buildLiveLeague(null, wildCardRound())).toBeNull()
    expect(buildLiveLeague(PICTURE, [])).toBeNull()
  })

  it('draws the 4/5 series on top and holds later rounds empty until decided', () => {
    const live = buildLiveLeague(PICTURE, wildCardRound())!
    expect(live.wildCard[0].entrants.map(t => t?.seed)).toEqual([4, 5])
    expect(live.wildCard[1].entrants.map(t => t?.seed)).toEqual([3, 6])
    expect(live.division[0].entrants).toEqual([S.mil, null])
    expect(live.division[1].entrants).toEqual([S.lad, null])
    expect(live.championship.entrants).toEqual([null, null])
    expect(live.champion).toBeNull()
  })

  it('advances winners without reseeding, round by round, to the pennant', () => {
    const games = [
      ...wildCardRound(),
      // The 6 seed wins the Wild Card Series and so meets the 2 seed.
      game('F', PHI, ATL, 1, { winner: PHI }),
      game('F', PHI, ATL, 2, { winner: PHI }),
      game('F', CHC, SD, 1, { winner: SD }),
      game('F', CHC, SD, 2, { winner: SD }),
      ...[1, 2, 3].map(n => game('D', PHI, LAD, n, { winner: PHI })),
      ...[1, 2, 3].map(n => game('D', SD, MIL, n, { winner: MIL })),
      ...[1, 2, 3, 4].map(n => game('L', PHI, MIL, n, { winner: PHI })),
    ]
    const live = buildLiveLeague(PICTURE, games)!
    expect(advancing(live.wildCard[1])).toEqual(S.phi)
    expect(live.division[1].entrants).toEqual([S.lad, S.phi])
    expect(live.division[1].wins).toEqual([0, 3])
    expect(live.championship.entrants).toEqual([S.mil, S.phi])
    expect(live.championship.winner).toBe(1)
    expect(live.champion).toEqual(S.phi)
    expect(viewStatus(live.championship)).toBe('Phillies win 4–0')
  })

  it("doesn't count an earlier round's games toward a later one", () => {
    const games = [
      ...wildCardRound(),
      game('F', PHI, ATL, 1, { winner: PHI }),
      game('F', PHI, ATL, 2, { winner: PHI }),
    ]
    const live = buildLiveLeague(PICTURE, games)!
    // The Wild Card Series is 2-0; the Division Series hasn't started.
    expect(live.division[1].entrants).toEqual([S.lad, S.phi])
    expect(live.division[1].wins).toEqual([0, 0])
    expect(live.division[1].series).toBeNull()
  })
})

describe('buildWorldSeries', () => {
  it('waits for both pennants, then counts World Series games', () => {
    const yankees = seeded(1, NYY, 'Yankees')
    const nl = { champion: S.phi } as Parameters<typeof buildWorldSeries>[0]
    const al = { champion: yankees } as Parameters<typeof buildWorldSeries>[1]
    expect(buildWorldSeries(nl, null, []).entrants).toEqual([S.phi, null])
    const ws = buildWorldSeries(nl, al, [
      game('W', PHI, NYY, 1, { winner: NYY }),
      game('W', PHI, NYY, 2, { winner: PHI }),
      game('W', NYY, PHI, 3),
    ])
    expect(ws.wins).toEqual([1, 1])
    expect(viewStatus(ws)).toBe('Series tied 1–1')
  })
})
