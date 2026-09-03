import { describe, expect, it } from 'vitest'
import type { SeasonGameResult } from '../../types/mlb'
import type { TiebreakerRecord } from '../tiebreakers'
import { applyTiebreakers, teamsNeedingTiebreak } from '../tiebreakers'

const NL = 104
const NL_EAST = 204
const NL_WEST = 203

function record(id: number, wins: number, losses: number, divisionId = NL_EAST, splits?: TiebreakerRecord['records']): TiebreakerRecord {
  return { team: { id, division: { id: divisionId } }, wins, losses, records: splits }
}

/** One club's season results against a set of opponents: [opponentId, won]. */
function results(rows: [number, number, number][]): Map<number, SeasonGameResult[]> {
  const map = new Map<number, SeasonGameResult[]>()
  for (const [teamId, opponentId, wins] of rows) {
    const games = map.get(teamId) ?? []
    for (let i = 0; i < Math.abs(wins); i++) games.push({ opponentId, won: wins > 0 })
    map.set(teamId, games)
  }
  return map
}

describe('teamsNeedingTiebreak', () => {
  it('flags a multi-club tie inside the rendered window', () => {
    const records = [record(1, 80, 55), record(2, 74, 61), record(3, 74, 61), record(4, 70, 65)]
    expect(teamsNeedingTiebreak(records, 7).sort()).toEqual([2, 3])
  })

  it('ignores clubs that are not tied with anyone', () => {
    expect(teamsNeedingTiebreak([record(1, 80, 55), record(2, 74, 61)], 7)).toEqual([])
  })

  it('flags a group straddling the window edge', () => {
    // One member inside the window is enough — this is what keeps the rendered
    // playoff-cutoff row honest.
    const records = [record(1, 80, 55), record(2, 74, 61), record(3, 74, 61)]
    expect(teamsNeedingTiebreak(records, 2).sort()).toEqual([2, 3])
  })

  it('ignores a tie entirely below the window', () => {
    const records = [record(1, 80, 55), record(2, 74, 61), record(3, 74, 61)]
    expect(teamsNeedingTiebreak(records, 1)).toEqual([])
  })

  it('treats equal percentage with unequal games played as a tie', () => {
    // 80-40 and 60-30 are both .667. Comparing w/(w+l) as floats is unreliable,
    // so the module cross-multiplies instead.
    expect(teamsNeedingTiebreak([record(1, 80, 40), record(2, 60, 30)], 7).sort()).toEqual([1, 2])
  })
})

describe('applyTiebreakers', () => {
  it('leaves untied clubs alone and gives them no note', () => {
    const records = [record(1, 80, 55), record(2, 74, 61)]
    const { ordered, notes } = applyTiebreakers(records, new Map(), NL)
    expect(ordered.map(r => r.team.id)).toEqual([1, 2])
    expect(notes.size).toBe(0)
  })

  it('orders a tie by head-to-head, overriding the API order', () => {
    // MLB's own ranks break this tie by ascending team id, which would leave
    // club 2 ahead. The 2022 CBA says head-to-head decides it.
    const records = [record(2, 74, 61), record(3, 74, 61)]
    const h2h = results([[3, 2, 4], [2, 3, -4]])
    const { ordered, notes } = applyTiebreakers(records, h2h, NL)
    expect(ordered.map(r => r.team.id)).toEqual([3, 2])
    expect(notes.get(3)?.detail).toBe('Head-to-head vs tied clubs: 4-0')
  })

  it('falls through to intradivision when head-to-head is even', () => {
    const records = [
      record(2, 74, 61, NL_EAST, { divisionRecords: [{ division: { id: NL_EAST }, wins: 20, losses: 20 }] }),
      record(3, 74, 61, NL_EAST, { divisionRecords: [{ division: { id: NL_EAST }, wins: 30, losses: 10 }] }),
    ]
    const even = results([[2, 3, 3], [3, 2, 3]])
    const { ordered, notes } = applyTiebreakers(records, even, NL)
    expect(ordered.map(r => r.team.id)).toEqual([3, 2])
    expect(notes.get(3)?.detail).toBe('Intradivision: 30-10')
  })

  it('falls through to intraleague when the first two criteria are even', () => {
    const div = (wins: number, losses: number) => [{ division: { id: NL_EAST }, wins, losses }]
    const records = [
      record(2, 74, 61, NL_EAST, { divisionRecords: div(20, 20), leagueRecords: [{ league: { id: NL }, wins: 40, losses: 40 }] }),
      record(3, 74, 61, NL_EAST, { divisionRecords: div(20, 20), leagueRecords: [{ league: { id: NL }, wins: 50, losses: 30 }] }),
    ]
    const even = results([[2, 3, 3], [3, 2, 3]])
    const { ordered, notes } = applyTiebreakers(records, even, NL)
    expect(ordered.map(r => r.team.id)).toEqual([3, 2])
    expect(notes.get(3)?.detail).toBe('Intraleague: 50-30')
  })

  it('skips a criterion that is inconclusive for any member rather than scoring it .000', () => {
    // Club 3 played nobody in the group, so head-to-head cannot rank the group;
    // a missing record must not be read as a losing one.
    const records = [
      record(2, 74, 61, NL_EAST, { divisionRecords: [{ division: { id: NL_EAST }, wins: 20, losses: 20 }] }),
      record(3, 74, 61, NL_EAST, { divisionRecords: [{ division: { id: NL_EAST }, wins: 30, losses: 10 }] }),
    ]
    const { ordered } = applyTiebreakers(records, new Map(), NL)
    expect(ordered.map(r => r.team.id)).toEqual([3, 2])
  })

  it('keeps the API order when every criterion is exhausted', () => {
    const records = [record(2, 74, 61), record(3, 74, 61)]
    const { ordered } = applyTiebreakers(records, new Map(), NL)
    expect(ordered.map(r => r.team.id)).toEqual([2, 3])
  })

  it('restarts the chain for a still-tied subset', () => {
    // Head-to-head over the whole group separates club 4 out; the remaining two
    // are then re-compared head-to-head against each other, which can split
    // clubs the combined record could not.
    const records = [record(2, 74, 61, NL_WEST), record(3, 74, 61, NL_EAST), record(4, 74, 61, NL_EAST)]
    const h2h = results([
      [2, 3, 3], [2, 4, 3],
      [3, 2, -3], [3, 4, 4],
      [4, 2, -3], [4, 3, -4],
    ])
    const { ordered } = applyTiebreakers(records, h2h, NL)
    expect(ordered.map(r => r.team.id)).toEqual([2, 3, 4])
  })

  it('orders a three-club tie fully, not just its winner', () => {
    const records = [record(2, 74, 61), record(3, 74, 61), record(4, 74, 61)]
    const h2h = results([
      [4, 2, 6], [4, 3, 6],
      [3, 2, 6], [3, 4, -6],
      [2, 3, -6], [2, 4, -6],
    ])
    const { ordered } = applyTiebreakers(records, h2h, NL)
    expect(ordered.map(r => r.team.id)).toEqual([4, 3, 2])
  })

  it('preserves the clubs it was given, adding and dropping none', () => {
    const records = [record(1, 80, 55), record(2, 74, 61), record(3, 74, 61)]
    const { ordered } = applyTiebreakers(records, results([[3, 2, 4], [2, 3, -4]]), NL)
    expect(ordered).toHaveLength(3)
    expect(new Set(ordered.map(r => r.team.id))).toEqual(new Set([1, 2, 3]))
  })
})
