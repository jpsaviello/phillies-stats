import type { SeasonGameResult } from '../types/mlb'

/**
 * MLB's Stats API does NOT apply tiebreakers: `wildCardRank`/`leagueRank`/
 * `sportRank` order tied clubs by ascending team ID. Since 2022 every tie for
 * postseason position is decided mathematically, in this order:
 *   1. head-to-head record among the tied clubs
 *   2. higher winning pct in intradivision games
 *   3. higher winning pct in intraleague games
 *   4. higher winning pct over the last half of intraleague games
 * Criterion 4 needs each club's intraleague game sequence and is not implemented;
 * a group still tied after criterion 3 keeps the API's order.
 */

/** Structural shape shared by WildCardRecord (and, later, StandingsRecord). */
export interface TiebreakerRecord {
  team: { id: number; division?: { id: number } }
  wins: number
  losses: number
  records?: {
    divisionRecords?: { division: { id: number }; wins: number; losses: number }[]
    leagueRecords?: { league: { id: number }; wins: number; losses: number }[]
  }
}

export interface TiebreakerNote {
  /** Hover text naming the criterion and its numbers, e.g. "Head-to-head vs tied clubs: 7-2". */
  detail: string
}

type Pct = { wins: number; losses: number } | null

const pctOf = (r: Pct) => (r && r.wins + r.losses > 0 ? r.wins / (r.wins + r.losses) : null)

/**
 * Equal winning percentage, compared by cross-multiplication. Two clubs with
 * different games played can share a pct, and float equality on w/(w+l) is not
 * reliable — so never compare the divisions directly.
 */
function sameWinPct(a: TiebreakerRecord, b: TiebreakerRecord) {
  return a.wins * (b.wins + b.losses) === b.wins * (a.wins + a.losses)
}

/** Consecutive runs of equal-pct clubs. Runs of one are included; callers filter. */
function tiedGroups<T extends TiebreakerRecord>(records: T[]): T[][] {
  const groups: T[][] = []
  for (const r of records) {
    const last = groups[groups.length - 1]
    if (last && sameWinPct(last[0], r)) last.push(r)
    else groups.push([r])
  }
  return groups
}

/**
 * Team IDs whose head-to-head records are worth fetching: members of a multi-club
 * tie with at least one club inside the rendered window. A group straddling the
 * window boundary qualifies (one member is inside it), which is what keeps the
 * playoff-cutoff row honest.
 */
export function teamsNeedingTiebreak(records: TiebreakerRecord[], windowSize: number): number[] {
  return tiedGroups(records)
    .filter(g => g.length > 1 && records.indexOf(g[0]) < windowSize)
    .flatMap(g => g.map(r => r.team.id))
}

/** Combined record vs the other clubs in `group`, from this club's own schedule. */
function headToHead(record: TiebreakerRecord, group: TiebreakerRecord[], results: Map<number, SeasonGameResult[]>): Pct {
  const games = results.get(record.team.id)
  if (!games) return null
  const rivals = new Set(group.map(r => r.team.id).filter(id => id !== record.team.id))
  let wins = 0
  let losses = 0
  for (const g of games) {
    if (!rivals.has(g.opponentId)) continue
    if (g.won) wins++
    else losses++
  }
  return wins + losses > 0 ? { wins, losses } : null
}

function intradivision(record: TiebreakerRecord): Pct {
  const own = record.team.division?.id
  if (own == null) return null
  return record.records?.divisionRecords?.find(d => d.division.id === own) ?? null
}

function intraleague(record: TiebreakerRecord, leagueId: number): Pct {
  return record.records?.leagueRecords?.find(l => l.league.id === leagueId) ?? null
}

function describe(criterion: string, r: Pct) {
  return r ? `${criterion}: ${r.wins}-${r.losses}` : criterion
}

/**
 * The single best club in `group`, per the criteria chain.
 *
 * When a criterion narrows the group to a smaller subset that is still tied, the
 * chain RESTARTS at criterion 1 for that subset — head-to-head within a subset can
 * separate clubs that combined head-to-head over the wider group could not. This
 * terminates because the recursive call always receives a strictly smaller group.
 *
 * A criterion that returns null for any member (no games played against the rest of
 * the group, or a missing split record) is skipped as inconclusive rather than
 * scored as .000.
 */
function selectBest<T extends TiebreakerRecord>(
  group: T[],
  results: Map<number, SeasonGameResult[]>,
  leagueId: number,
  notes: Map<number, TiebreakerNote>
): T {
  if (group.length === 1) return group[0]

  const criteria: [string, (r: T) => Pct][] = [
    ['Head-to-head vs tied clubs', r => headToHead(r, group, results)],
    ['Intradivision', r => intradivision(r)],
    ['Intraleague', r => intraleague(r, leagueId)],
  ]

  for (const [label, measure] of criteria) {
    const scored = group.map(r => ({ r, raw: measure(r), pct: pctOf(measure(r)) }))
    if (scored.some(s => s.pct === null)) continue
    const max = Math.max(...scored.map(s => s.pct as number))
    const leaders = scored.filter(s => s.pct === max)
    if (leaders.length === 1) {
      const winner = leaders[0]
      notes.set(winner.r.team.id, { detail: describe(label, winner.raw) })
      return winner.r
    }
    if (leaders.length < group.length) {
      return selectBest(leaders.map(s => s.r), results, leagueId, notes)
    }
    // Every member tied on this criterion — fall through to the next.
  }

  return group[0] // still tied after criterion 3: keep the API's order
}

/**
 * Reorder `records` so tied clubs sit in true MLB tiebreaker order, and return a
 * note per club that was part of a multi-club tie (for the row's hover text).
 * Clubs not tied with anyone are untouched and get no note.
 */
export function applyTiebreakers<T extends TiebreakerRecord>(
  records: T[],
  results: Map<number, SeasonGameResult[]>,
  leagueId: number
): { ordered: T[]; notes: Map<number, TiebreakerNote> } {
  const notes = new Map<number, TiebreakerNote>()
  const ordered: T[] = []

  for (const group of tiedGroups(records)) {
    if (group.length === 1) {
      ordered.push(group[0])
      continue
    }
    let remaining = group
    while (remaining.length > 0) {
      const best = selectBest(remaining, results, leagueId, notes)
      if (!notes.has(best.team.id)) {
        notes.set(best.team.id, { detail: describe('Head-to-head vs tied clubs', headToHead(best, group, results)) })
      }
      ordered.push(best)
      remaining = remaining.filter(r => r !== best)
    }
  }

  return { ordered, notes }
}
