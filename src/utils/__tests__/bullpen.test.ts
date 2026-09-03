import { describe, expect, it } from 'vitest'
import type { BullpenBoxscore } from '../../api/mlb'
import type { BullpenOuting, RosterEntry } from '../../types/mlb'
import type { RawAppearance } from '../bullpen'
import { buildWorkloads, extractTeamPitchers, sortByRecency, workloadFlags } from '../bullpen'

const PHILLIES = 143
const TODAY = '2026-09-03'

function outing(date: string, pitches: number, extra: Partial<BullpenOuting> = {}): BullpenOuting {
  return {
    gamePk: 1, date, pitches, inningsPitched: '1.0', battersFaced: 4, earnedRuns: 0,
    strikeOuts: 1, baseOnBalls: 0, hits: 1, inheritedRunners: 0, wasStart: false, ...extra,
  }
}

function appearance(playerId: number, name: string, date: string, pitches: number, extra: Partial<BullpenOuting> = {}): RawAppearance {
  return { playerId, name, ...outing(date, pitches, extra) }
}

const rosterPitcher = (id: number, fullName: string): RosterEntry => ({
  person: { id, fullName },
  jerseyNumber: '50',
  position: { abbreviation: 'P', name: 'Pitcher', type: 'Pitcher' },
  status: { description: 'Active' },
}) as RosterEntry

describe('extractTeamPitchers', () => {
  function box(sideKey: 'home' | 'away', teamId: number): BullpenBoxscore {
    return {
      liveData: {
        boxscore: {
          teams: {
            [sideKey]: {
              team: { id: teamId },
              pitchers: [601, 602],
              players: {
                ID601: { person: { fullName: 'Cristopher Sánchez' }, stats: { pitching: { pitchesThrown: 94, inningsPitched: '6.1', gamesStarted: 1, earnedRuns: 2, strikeOuts: 7, battersFaced: 24, baseOnBalls: 1, hits: 5, inheritedRunners: 0 } } },
                ID602: { person: { fullName: 'Orion Kerkering' }, stats: { pitching: { pitchesThrown: 18, inningsPitched: '1.0', earnedRuns: 0, strikeOuts: 2, battersFaced: 3, baseOnBalls: 0, hits: 0, inheritedRunners: 1 } } },
              },
            },
          },
        },
      },
    } as unknown as BullpenBoxscore
  }

  it('reads the pitching lines from whichever side is the Phillies', () => {
    for (const side of ['home', 'away'] as const) {
      const pitchers = extractTeamPitchers(box(side, PHILLIES), PHILLIES, 800001, TODAY)
      expect(pitchers.map(p => p.name)).toEqual(['Cristopher Sánchez', 'Orion Kerkering'])
    }
  })

  it('follows pitchers[] for order rather than object key order', () => {
    const pitchers = extractTeamPitchers(box('home', PHILLIES), PHILLIES, 800001, TODAY)
    expect(pitchers.map(p => p.playerId)).toEqual([601, 602])
  })

  it('marks a start as one, per outing', () => {
    const pitchers = extractTeamPitchers(box('home', PHILLIES), PHILLIES, 800001, TODAY)
    expect(pitchers.map(p => p.wasStart)).toEqual([true, false])
  })

  it('returns nothing when the team is not in the boxscore', () => {
    expect(extractTeamPitchers(box('home', 121), PHILLIES, 800001, TODAY)).toEqual([])
    expect(extractTeamPitchers({ liveData: {} } as BullpenBoxscore, PHILLIES, 800001, TODAY)).toEqual([])
  })
})

describe('workloadFlags', () => {
  it('says back-to-back for exactly two consecutive days', () => {
    expect(workloadFlags([outing('2026-09-02', 15), outing('2026-09-03', 12)], TODAY)).toContain('back-to-back')
  })

  it('counts a three-day streak', () => {
    // The single most predictive fact about how a late inning goes.
    const flags = workloadFlags([outing('2026-09-01', 20), outing('2026-09-02', 15), outing('2026-09-03', 12)], TODAY)
    expect(flags).toContain('3 straight days')
    expect(flags).not.toContain('back-to-back')
  })

  it('measures the streak from the most recent outing, not from today', () => {
    // Kerkering's 3-straight ended on 8/18, three days before the panel was
    // spot-checked; the flag still describes the stretch that happened.
    const flags = workloadFlags([outing('2026-08-16', 20), outing('2026-08-17', 15), outing('2026-08-18', 12)], TODAY)
    expect(flags).toContain('3 straight days')
  })

  it('breaks the streak on a day off', () => {
    const flags = workloadFlags([outing('2026-09-01', 20), outing('2026-09-03', 12)], TODAY)
    expect(flags.some(f => f.includes('straight') || f === 'back-to-back')).toBe(false)
  })

  it('reports frequency within the window when it says more than the streak', () => {
    // Three appearances in four days without three of them being consecutive.
    const flags = workloadFlags([outing('2026-08-31', 20), outing('2026-09-02', 15), outing('2026-09-03', 12)], TODAY)
    expect(flags).toContain('3 of last 4 days')
  })

  it('does not repeat the frequency flag when the streak already says it', () => {
    const flags = workloadFlags([outing('2026-09-01', 20), outing('2026-09-02', 15), outing('2026-09-03', 12)], TODAY)
    expect(flags.filter(f => f.includes('of last'))).toEqual([])
  })

  it('flags a heavy last outing by pitch count', () => {
    expect(workloadFlags([outing('2026-09-03', 41)], TODAY)).toContain('41+ pitches last outing')
    expect(workloadFlags([outing('2026-09-03', 39)], TODAY).some(f => f.includes('pitches'))).toBe(false)
  })

  it('has nothing to say about a pitcher who has not appeared', () => {
    expect(workloadFlags([], TODAY)).toEqual([])
  })
})

describe('buildWorkloads', () => {
  const appearances = [
    appearance(601, 'Cristopher Sánchez', '2026-08-30', 94, { inningsPitched: '6.1', wasStart: true }),
    appearance(602, 'Orion Kerkering', '2026-09-02', 18),
    appearance(602, 'Orion Kerkering', '2026-09-03', 12),
  ]

  it('classifies role from season splits, not from the roster', () => {
    // Every active pitcher comes back position.type "Pitcher" — there is no
    // SP/RP field anywhere in the roster response.
    const workloads = buildWorkloads(appearances, [], [
      { player: { id: 601 }, stat: { gamesStarted: 27, gamesPlayed: 27 } },
      { player: { id: 602 }, stat: { gamesStarted: 0, gamesPlayed: 60 } },
    ], TODAY)
    expect(workloads.find(w => w.playerId === 601)?.role).toBe('starter')
    expect(workloads.find(w => w.playerId === 602)?.role).toBe('reliever')
  })

  it('falls back to the window when a pitcher has no season splits yet', () => {
    // A September callup, or splits that simply have not loaded.
    const workloads = buildWorkloads(appearances, [], [], TODAY)
    expect(workloads.find(w => w.playerId === 601)?.role).toBe('starter')
    expect(workloads.find(w => w.playerId === 602)?.role).toBe('reliever')
  })

  it('keeps a reliever with one spot start classified by his season', () => {
    const spotStart = [appearance(602, 'Orion Kerkering', '2026-09-01', 40, { wasStart: true })]
    const workloads = buildWorkloads(spotStart, [], [{ player: { id: 602 }, stat: { gamesStarted: 1, gamesPlayed: 60 } }], TODAY)
    expect(workloads[0].role).toBe('reliever')
  })

  it('includes rostered pitchers who did not appear at all', () => {
    // The fresh arms are the point of the panel, not noise to omit.
    const workloads = buildWorkloads(appearances, [rosterPitcher(603, 'Jhoan Duran')], [], TODAY)
    const idle = workloads.find(w => w.playerId === 603)
    expect(idle).toMatchObject({ name: 'Jhoan Duran', totalPitches: 0, daysSinceLast: null })
    expect(idle?.flags).toEqual([])
  })

  it('ignores position players on the roster', () => {
    const catcher = { ...rosterPitcher(700, 'J.T. Realmuto'), position: { abbreviation: 'C', name: 'Catcher', type: 'Catcher' } } as RosterEntry
    expect(buildWorkloads(appearances, [catcher], [], TODAY).some(w => w.playerId === 700)).toBe(false)
  })

  it('totals pitches and sums innings through outs', () => {
    const twoThirds = [
      appearance(602, 'Orion Kerkering', '2026-09-02', 18, { inningsPitched: '0.2' }),
      appearance(602, 'Orion Kerkering', '2026-09-03', 12, { inningsPitched: '0.2' }),
    ]
    const workload = buildWorkloads(twoThirds, [], [], TODAY)[0]
    expect(workload.totalPitches).toBe(30)
    // Four outs — 1.1 innings, never the 1.4 that adding the strings gives.
    expect(workload.totalOuts).toBe(4)
  })

  it('counts days of rest against the supplied today, never Date.now()', () => {
    const workloads = buildWorkloads(appearances, [], [], TODAY)
    expect(workloads.find(w => w.playerId === 601)?.daysSinceLast).toBe(4)
    expect(workloads.find(w => w.playerId === 602)?.daysSinceLast).toBe(0)
  })

  it('lists each pitcher\'s outings most recent first', () => {
    const workload = buildWorkloads(appearances, [], [], TODAY).find(w => w.playerId === 602)
    expect(workload?.outings.map(o => o.date)).toEqual(['2026-09-03', '2026-09-02'])
  })
})

describe('sortByRecency', () => {
  it('puts the most recently used first and the idle arms last', () => {
    const workloads = buildWorkloads(
      [appearance(601, 'A', '2026-08-30', 94), appearance(602, 'B', '2026-09-03', 12)],
      [rosterPitcher(603, 'C')],
      [],
      TODAY
    )
    expect(sortByRecency(workloads).map(w => w.name)).toEqual(['B', 'A', 'C'])
  })

  it('does not mutate its input', () => {
    const workloads = buildWorkloads([appearance(601, 'A', '2026-08-30', 94), appearance(602, 'B', '2026-09-03', 12)], [], [], TODAY)
    const before = workloads.map(w => w.name)
    sortByRecency(workloads)
    expect(workloads.map(w => w.name)).toEqual(before)
  })
})
