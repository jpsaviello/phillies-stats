import type { DivisionLeaderRecord, WildCardRecord } from '../types/mlb'

/**
 * The National League postseason field, as the current standings would set it.
 *
 * Everything here is a snapshot of a standings state, never a projection: the
 * same standard PlayoffPush and BullpenUsage hold. See the playoff-picture
 * design spec.
 */

/** The NL sends three division winners and three wild cards. */
export const DIVISION_WINNERS = 3
export const WILD_CARDS = 3
export const FIELD_SIZE = DIVISION_WINNERS + WILD_CARDS
/** Seeds 1 and 2 sit out the Wild Card Series. */
export const BYES = 2

export interface SeededTeam {
  /** 1-6. */
  seed: number
  teamId: number
  /** Club name as MLB gives it for that response — "Braves", "Phillies". */
  name: string
  wins: number
  losses: number
  /** How they got in. Division winners hold seeds 1-3 regardless of record. */
  berth: 'division' | 'wildCard'
  /** "NL East" for a division winner; null for a wild card. */
  division: string | null
  /** Wild card games back, as MLB formats it ("-", "+4.5", "2.0"); null for a leader. */
  gamesBack: string | null
  /** MLB's own clinch letter, or null when the club hasn't clinched anything. */
  clinch: string | null
}

/** One Wild Card Series: three games, all of them at the higher seed's park. */
export interface WildCardSeries {
  higher: SeededTeam
  lower: SeededTeam
}

/** A club on a bye, and which series it is waiting on. There is no reseeding. */
export interface ByeTeam {
  team: SeededTeam
  /** The seeds whose series produces this club's opponent, e.g. [4, 5]. */
  awaits: [number, number]
}

export interface PlayoffPicture {
  byes: ByeTeam[]
  series: WildCardSeries[]
  /** The best club currently outside the field, or null when nobody is left. */
  firstOut: {
    teamId: number
    name: string
    wins: number
    losses: number
    /** Games back of the final wild card spot, as MLB formats it. */
    gamesBack: string
  } | null
}

/** Winning percentage, guarding the 0-0 opening day case. */
function pct(r: { wins: number; losses: number }) {
  return r.wins + r.losses > 0 ? r.wins / (r.wins + r.losses) : 0
}

/**
 * The leaders sorted best record first.
 *
 * Ordering only — this deliberately does NOT break ties, because a tie between
 * division leaders decides who gets a bye and MLB's real chain (head-to-head,
 * then intradivision, then intraleague) needs a network round trip per tied club.
 * useDivisionLeaders runs applyTiebreakers over the output of this, which is what
 * that function needs anyway: it groups CONSECUTIVE equal-percentage clubs.
 */
export function byRecord<T extends { wins: number; losses: number }>(records: T[]): T[] {
  return [...records].sort((a, b) => pct(b) - pct(a))
}

function seedLeader(record: DivisionLeaderRecord, seed: number): SeededTeam {
  return {
    seed,
    teamId: record.team.id,
    name: record.team.name,
    wins: record.wins,
    losses: record.losses,
    berth: 'division',
    division: record.team.division.name || null,
    gamesBack: null,
    // The regularSeason response has no clinchIndicator letter, only booleans.
    clinch: record.divisionChamp ? 'z' : record.clinched ? 'x' : null,
  }
}

function seedWildCard(record: WildCardRecord, seed: number): SeededTeam {
  return {
    seed,
    teamId: record.team.id,
    // hydrate=team(division) swaps `name` to the full club name, so the short
    // one is preferred here exactly as WildCardStandings prefers it.
    name: record.team.teamName ?? record.team.name,
    wins: record.wins,
    losses: record.losses,
    berth: 'wildCard',
    division: null,
    gamesBack: record.wildCardGamesBack,
    clinch: record.clinchIndicator ?? null,
  }
}

/**
 * Seed the field and pair it into the bracket.
 *
 * THE FORMAT TRAP: division winners take seeds 1-3 and wild cards 4-6, and the
 * two lists are NEVER sorted together. A wild card club can hold a better record
 * than a division winner and still seed below it — that is the whole point of
 * winning a division, and merging the six by record would quietly invent a
 * different postseason.
 *
 * `leaders` must already be in seeding order (see useDivisionLeaders); `wildCard`
 * is the tiebreaker-corrected race order useWildCardRace produces, whose first
 * three entries are the clubs in.
 *
 * Returns null unless the field is complete — the offseason, the opening week, a
 * failed request, or any future format that isn't six clubs. Callers self-hide.
 */
export function buildPlayoffPicture(
  leaders: DivisionLeaderRecord[],
  wildCard: WildCardRecord[]
): PlayoffPicture | null {
  if (leaders.length < DIVISION_WINNERS || wildCard.length < WILD_CARDS) return null

  const seeds = [
    ...leaders.slice(0, DIVISION_WINNERS).map((r, i) => seedLeader(r, i + 1)),
    ...wildCard.slice(0, WILD_CARDS).map((r, i) => seedWildCard(r, DIVISION_WINNERS + i + 1)),
  ]

  const bySeed = (seed: number) => seeds[seed - 1]

  // 3 hosts 6 and 4 hosts 5, and the round does not reseed: the 1 seed meets
  // whoever comes out of 4/5, the 2 seed whoever comes out of 3/6.
  const series: WildCardSeries[] = [
    { higher: bySeed(3), lower: bySeed(6) },
    { higher: bySeed(4), lower: bySeed(5) },
  ]

  const byes: ByeTeam[] = [
    { team: bySeed(1), awaits: [4, 5] },
    { team: bySeed(2), awaits: [3, 6] },
  ]

  const out = wildCard[WILD_CARDS]
  const firstOut = out
    ? {
        teamId: out.team.id,
        name: out.team.teamName ?? out.team.name,
        wins: out.wins,
        losses: out.losses,
        gamesBack: out.wildCardGamesBack,
      }
    : null

  return { byes, series, firstOut }
}

/** The seed a club holds in this field, or null when it isn't in one. */
export function seedOf(picture: PlayoffPicture | null, teamId: number): number | null {
  if (!picture) return null
  const all = [...picture.byes.map(b => b.team), ...picture.series.flatMap(s => [s.higher, s.lower])]
  return all.find(t => t.teamId === teamId)?.seed ?? null
}
