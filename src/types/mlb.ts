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
