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
}

export interface PitchingGameStat {
  inningsPitched: string
  hits: number
  runs: number
  earnedRuns: number
  baseOnBalls: number
  strikeOuts: number
}

export interface GameLogSplit {
  date: string
  opponent: GameLogOpponent
  isHome: boolean
  stat: BattingGameStat | PitchingGameStat
}
