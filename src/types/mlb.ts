export interface Player {
  id: number
  fullName: string
  primaryNumber: string
  primaryPosition: { abbreviation: string; name: string }
}

export interface BattingStats {
  gamesPlayed: number
  atBats: number
  runs: number
  hits: number
  doubles: number
  triples: number
  homeRuns: number
  rbi: number
  stolenBases: number
  avg: string
  obp: string
  slg: string
  ops: string
  strikeOuts: number
  baseOnBalls: number
}

/**
 * A hitter's line over a trailing date window (`stats=byDateRange`).
 *
 * Separate from BattingStats rather than a widened version of it because the
 * Batting table's column list is typed `keyof BattingStats`, and plate
 * appearances are only ever read here — as the sample-size gate for the Hot &
 * Cold panel, where a pitcher's single at-bat would otherwise show up as a
 * .000 hitter in a freefall.
 */
export interface WindowBattingStats extends BattingStats {
  plateAppearances: number
}

/**
 * One hitter's recent form: the window line plus how its OPS compares with the
 * same player's season OPS. Deliberately carries no projection — see the
 * batting-form design spec.
 */
export interface HitterForm {
  playerId: number
  name: string
  games: number
  atBats: number
  hits: number
  homeRuns: number
  rbi: number
  /** As MLB formats them, e.g. ".286" / "1.171". */
  avg: string
  ops: string
  /** Season OPS, or null when the player has no season line to compare against. */
  seasonOps: number | null
  /** Window OPS minus season OPS; null whenever either side is missing. */
  opsDelta: number | null
  trend: 'hot' | 'cold' | 'steady' | 'unknown'
}

export interface PitchingStats {
  gamesPlayed: number
  gamesStarted: number
  wins: number
  losses: number
  era: string
  inningsPitched: string
  strikeOuts: number
  baseOnBalls: number
  hits: number
  homeRuns: number
  whip: string
  saves: number
  // Opponent batting average — present in statSplits responses (the API omits
  // era for a pitcher's vl/vr splits, but avg exists for all four).
  avg?: string
}

export interface PlayerWithStats {
  player: Player
  batting?: BattingStats
  pitching?: PitchingStats
}

/**
 * Roster status codes seen live on the 40-man: Active, the three IL tiers, and
 * Reassigned to Minors. The `(string & {})` arm keeps an unseen code (paternity
 * list, restricted list, suspension) assignable so it falls through to a default
 * group instead of failing to type — the roster must never fail to render
 * because MLB added a status we hadn't met.
 */
export type RosterStatusCode = 'A' | 'D10' | 'D15' | 'D60' | 'RM' | (string & {})

/**
 * One entry from `rosterType=40Man` hydrated with the player's season line.
 *
 * Distinct from [RosterEntry], which models the un-hydrated `rosterType=active`
 * response BullpenUsage depends on. The 40-man view returns 45 entries, not 40:
 * 60-day IL players don't count against the 40-man but the API includes them,
 * which is exactly the behavior the Roster tab wants.
 */
export interface RosterPlayer {
  person: {
    id: number
    fullName: string
    currentAge?: number
    batSide?: { code: string }
    pitchHand?: { code: string }
    /**
     * Present for anyone with 2026 appearances; absent entirely for players who
     * have none (five of them live today), so every consumer must handle a
     * missing array rather than indexing into it.
     */
    stats?: {
      group: { displayName: string }
      splits: { stat: BattingStats | PitchingStats }[]
    }[]
  }
  /** Can be an empty string — five of today's twelve minors players have no number. */
  jerseyNumber: string
  position: { abbreviation: string; name: string; type: string }
  status: { code: RosterStatusCode; description: string }
}

export interface RosterEntry {
  person: Player
  jerseyNumber: string
  position: { abbreviation: string; name: string; type: string }
  status: { description: string }
}

export interface StandingsRecord {
  team: { id: number; name: string }
  wins: number
  losses: number
  gamesBack: string
  divisionRank: string
  /**
   * Clinch/elimination fields the regularSeason response already carries. MLB
   * sends "-" (not a number, and not absent) for a figure that doesn't apply —
   * e.g. magicNumber on a non-leader — so every consumer must treat a
   * non-numeric string as "no value" rather than parsing it.
   */
  magicNumber?: string
  eliminationNumber?: string
  wildCardEliminationNumber?: string
  divisionLeader?: boolean
  clinched?: boolean
}

/** One not-yet-played regular-season game, reduced to what the panel needs. */
export interface RemainingGame {
  opponentId: number
  isHome: boolean
}

export interface TeamRecord {
  wins: number
  losses: number
}

// The wildCard standings type shares almost no fields with StandingsRecord
// (rank/GB are wild-card-specific), so it's kept separate rather than making
// StandingsRecord a bag of optionals. clinchIndicator is absent until clinched.
export interface WildCardRecord {
  team: {
    id: number
    name: string
    /** Short club name ("Phillies"); present only with hydrate=team(division). */
    teamName?: string
    /** Present only with hydrate=team(division). Needed for the intradivision tiebreaker. */
    division?: { id: number; name: string }
  }
  wins: number
  losses: number
  wildCardRank: string
  wildCardGamesBack: string
  clinchIndicator?: string
  records?: {
    divisionRecords?: { division: { id: number }; wins: number; losses: number }[]
    leagueRecords?: { league: { id: number }; wins: number; losses: number }[]
  }
}

/** One completed regular-season game, reduced to what a head-to-head tally needs. */
export interface SeasonGameResult {
  opponentId: number
  won: boolean
}

/**
 * An announced probable starter. Present only with hydrate=probablePitcher, and
 * MLB doesn't post one until roughly two days out — so it is absent for most of
 * any schedule window, which is the normal case rather than an error.
 */
export interface ProbablePitcher {
  id: number
  fullName: string
}

/** A starter's recent work, aggregated across their last N starts. */
export interface RecentForm {
  starts: number
  /** Formatted the way MLB does it: "18.1" is 18 innings and one out. */
  inningsPitched: string
  earnedRuns: number
  strikeOuts: number
  /** ERA across just this span, computed from outs — not averaged from game ERAs. */
  era: string
}

export interface GameLogOpponent {
  id: number
  name: string
}

export interface BattingGameStat {
  atBats: number
  runs: number
  hits: number
  homeRuns: number
  rbi: number
  baseOnBalls: number
  strikeOuts: number
  // Season-to-date through this game, not single-game (gameLog rate stats are cumulative).
  ops: string
}

export interface PitchingGameStat {
  inningsPitched: string
  hits: number
  runs: number
  earnedRuns: number
  baseOnBalls: number
  strikeOuts: number
  // 1 when the pitcher started that game, 0 for a relief appearance. Needed to
  // pick out a starter's last N *starts* — a game log mixes both, and an opener
  // or spot relief outing would otherwise distort the recent-form line.
  gamesStarted?: number
}

export interface GameLogSplit {
  date: string
  opponent: GameLogOpponent
  isHome: boolean
  stat: BattingGameStat | PitchingGameStat
}

export interface StatSplit {
  split: { code: string; description: string } // vl, vr, h, a
  stat: BattingStats | PitchingStats
}

/**
 * One relief/start appearance, reduced from a game's boxscore pitching line to
 * what workload tracking needs. `wasStart` is a per-outing fact (this game),
 * distinct from a player's season-long role — see PitcherWorkload.role.
 */
export interface BullpenOuting {
  gamePk: number
  date: string
  pitches: number
  inningsPitched: string
  battersFaced: number
  earnedRuns: number
  strikeOuts: number
  baseOnBalls: number
  hits: number
  inheritedRunners: number
  wasStart: boolean
}

/**
 * One pitcher's workload over the tracked window. `role` classifies the player
 * for the whole window (season gamesStarted/gamesPlayed, falling back to
 * per-outing wasStart when season splits aren't available yet — see the
 * bullpen-usage design spec, decision 2, for why the roster alone can't do this).
 * `daysSinceLast` is null when the pitcher has no outings in the window at all,
 * which is a fact worth showing, not an error.
 */
export interface PitcherWorkload {
  playerId: number
  name: string
  role: 'reliever' | 'starter'
  outings: BullpenOuting[]
  totalPitches: number
  totalOuts: number
  daysSinceLast: number | null
  flags: string[]
}
