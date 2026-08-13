import type { GameLogSplit, StatSplit } from '../types/mlb'

const BASE = '/api/mlb'
const PHILLIES_ID = 143
const SEASON = 2026

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`MLB API error: ${res.status} ${path}`)
  return res.json()
}

export async function fetchRoster() {
  const data = await get<{ roster: import('../types/mlb').RosterEntry[] }>(
    `/teams/${PHILLIES_ID}/roster?rosterType=active&season=${SEASON}`
  )
  return data.roster
}

export async function fetchBattingStats() {
  const data = await get<{ stats: { splits: { player: import('../types/mlb').Player; stat: import('../types/mlb').BattingStats }[] }[] }>(
    `/stats?stats=season&group=hitting&season=${SEASON}&sportId=1&teamId=${PHILLIES_ID}&playerPool=ALL&hydrate=person`
  )
  return (data.stats[0]?.splits ?? []).filter(s => s.player != null)
}

export async function fetchPitchingStats() {
  const data = await get<{ stats: { splits: { player: import('../types/mlb').Player; stat: import('../types/mlb').PitchingStats }[] }[] }>(
    `/stats?stats=season&group=pitching&season=${SEASON}&sportId=1&teamId=${PHILLIES_ID}&playerPool=ALL`
  )
  return (data.stats[0]?.splits ?? []).filter(s => s.player != null)
}

export async function fetchStandings() {
  // NL East division ID = 204
  const data = await get<{ records: { teamRecords: import('../types/mlb').StandingsRecord[] }[] }>(
    `/standings?leagueId=104&season=${SEASON}&standingsTypes=regularSeason`
  )
  const nlEast = data.records.find(r =>
    r.teamRecords.some(t => t.team.id === PHILLIES_ID)
  )
  return nlEast?.teamRecords ?? []
}

// standingsTypes=wildCard returns a SINGLE record group for the league (not one
// per division): every non-division-leader team, already sorted by
// wildCardRank. Don't reuse fetchStandings' find-by-Phillies logic here — the
// Phillies drop out of this response entirely while they lead the NL East.
// hydrate=team(division) is required for the intradivision tiebreaker (the team
// object is otherwise just {id,name,link}). It also swaps team.name from the short
// club name to the full one, which is why callers display team.teamName ?? team.name.
export async function fetchWildCardStandings() {
  const data = await get<{ records: { teamRecords: import('../types/mlb').WildCardRecord[] }[] }>(
    `/standings?leagueId=104&season=${SEASON}&standingsTypes=wildCard&hydrate=team(division)`
  )
  return data.records[0]?.teamRecords ?? []
}

// One club's completed regular-season games, reduced to opponent + win/loss. Used
// only to compute head-to-head records for standings tiebreakers, which the
// /standings response does not carry at any hydration level. The fields= list keeps
// this to ~25KB for a full season; isWinner means no score comparison is needed.
export async function fetchSeasonResults(teamId: number) {
  const data = await get<{
    dates: {
      games: {
        status: { abstractGameState: string }
        teams: {
          home: { team: { id: number }; isWinner?: boolean }
          away: { team: { id: number }; isWinner?: boolean }
        }
      }[]
    }[]
  }>(
    `/schedule?sportId=1&season=${SEASON}&teamId=${teamId}&gameType=R` +
      `&fields=dates,games,gameType,status,abstractGameState,teams,home,away,team,id,isWinner`
  )

  const results: import('../types/mlb').SeasonGameResult[] = []
  for (const date of data.dates ?? []) {
    for (const game of date.games ?? []) {
      if (game.status.abstractGameState !== 'Final') continue
      const { home, away } = game.teams
      // A tie/suspended game has no isWinner on either side — count it for neither.
      if (home.isWinner === away.isWinner) continue
      const self = home.team.id === teamId ? home : away
      const other = home.team.id === teamId ? away : home
      results.push({ opponentId: other.team.id, won: self.isWinner === true })
    }
  }
  return results
}

// The games that HAVEN'T happened yet — same endpoint and fields= idiom as
// fetchSeasonResults, filtered the other way. Games remaining is derived from
// this count and never from 162 - (W+L): the schedule can carry more Final games
// than the standings show decisions for (a tie or suspended game), which puts
// that subtraction off by one.
export async function fetchRemainingSchedule() {
  const data = await get<{
    dates: {
      games: {
        status: { abstractGameState: string }
        teams: { home: { team: { id: number } }; away: { team: { id: number } } }
      }[]
    }[]
  }>(
    `/schedule?sportId=1&season=${SEASON}&teamId=${PHILLIES_ID}&gameType=R` +
      `&fields=dates,games,status,abstractGameState,teams,home,away,team,id`
  )

  const remaining: import('../types/mlb').RemainingGame[] = []
  for (const date of data.dates ?? []) {
    for (const game of date.games ?? []) {
      if (game.status.abstractGameState === 'Final') continue
      const isHome = game.teams.home.team.id === PHILLIES_ID
      remaining.push({
        opponentId: isHome ? game.teams.away.team.id : game.teams.home.team.id,
        isHome,
      })
    }
  }
  return remaining
}

// All 30 clubs' records in one call. Both leagues are required, not just the NL:
// the remaining schedule includes interleague games, so an NL-only map would
// leave the strength-of-schedule calculation with unknown opponents.
export async function fetchLeagueRecords() {
  const data = await get<{
    records: { teamRecords: { team: { id: number }; wins: number; losses: number }[] }[]
  }>(
    `/standings?leagueId=103,104&season=${SEASON}&standingsTypes=regularSeason` +
      `&fields=records,teamRecords,team,id,wins,losses`
  )

  const records = new Map<number, import('../types/mlb').TeamRecord>()
  for (const group of data.records ?? []) {
    for (const t of group.teamRecords ?? []) {
      records.set(t.team.id, { wins: t.wins, losses: t.losses })
    }
  }
  return records
}

export async function fetchSchedule(startDate: string, endDate: string) {
  const data = await get<{ dates: { date: string; games: Game[] }[] }>(
    `/schedule?teamId=${PHILLIES_ID}&startDate=${startDate}&endDate=${endDate}&sportId=1&hydrate=linescore`
  )
  return data.dates
}

export async function fetchGameLog(personId: number, group: 'hitting' | 'pitching') {
  const data = await get<{ stats: { splits: GameLogSplit[] }[] }>(
    `/people/${personId}/stats?stats=gameLog&group=${group}&season=${SEASON}&sportId=1`
  )
  // API returns the season's splits oldest-first (chronological). Callers that
  // want "last N, most recent first" slice/reverse themselves.
  return data.stats[0]?.splits ?? []
}

// Situational splits for one player: vs LHP/RHP (vl/vr) and home/away (h/a).
// Same /people/{id}/stats shape as gameLog; each split carries the full
// season-stat object under `stat`. Some sitCodes may be absent for small samples.
export async function fetchSplits(personId: number, group: 'hitting' | 'pitching') {
  const data = await get<{ stats: { splits: StatSplit[] }[] }>(
    `/people/${personId}/stats?stats=statSplits&sitCodes=vl,vr,h,a&group=${group}&season=${SEASON}&sportId=1`
  )
  return data.stats[0]?.splits ?? []
}

export interface AppConfig {
  allStarBanner: boolean
}

// Runtime feature flags from the backend (/api/config). Fails soft to
// everything-off so a missing/unreachable backend hides gated UI rather than
// flashing it; callers gate rendering on the resolved value.
export async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch('/api/config')
  if (!res.ok) throw new Error(`Config API ${res.status}`)
  return res.json()
}

export function teamLogoUrl(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`
}

export function playerHeadshotUrl(personId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png,q_auto:best,f_auto/v1/people/${personId}/headshot/67/current`
}

export interface Game {
  gamePk: number
  gameDate: string
  status: { abstractGameState: string; detailedState: string }
  teams: {
    home: { team: { id: number; name: string }; score?: number; isWinner?: boolean }
    away: { team: { id: number; name: string }; score?: number; isWinner?: boolean }
  }
}

// Trimmed shape of the v1.1 live feed. Pre-game feeds omit linescore and
// currentPlay entirely, and matchup can be absent between innings.
export interface LiveFeed {
  gameData: {
    status: { abstractGameState: string; detailedState: string }
    teams: { home: { id: number }; away: { id: number } }
  }
  liveData: {
    linescore?: {
      currentInning?: number
      inningState?: string
      isTopInning?: boolean
      balls?: number
      strikes?: number
      outs?: number
      teams: { home: { runs?: number }; away: { runs?: number } }
    }
    plays: {
      currentPlay?: {
        matchup?: {
          batter: { id: number; fullName: string }
          pitcher: { id: number; fullName: string }
        }
      }
    }
  }
}

// The raw feed is ~1MB; MLB's fields param (matches names at any depth)
// trims it to a few hundred bytes containing just what LiveFeed models.
const LIVE_FEED_FIELDS =
  'gameData,status,abstractGameState,detailedState,liveData,linescore,' +
  'currentInning,inningState,isTopInning,balls,strikes,outs,teams,home,away,runs,' +
  'plays,currentPlay,matchup,batter,pitcher,id,fullName'

export async function fetchLiveFeed(gamePk: number): Promise<LiveFeed> {
  return get(`/game/${gamePk}/feed/live?fields=${LIVE_FEED_FIELDS}`)
}

// One player's line in a single game. `stats` is that game's line and is an
// EMPTY object for anyone who didn't appear — the response carries the whole
// 26-man roster, not just the players who played. Callers must filter on the
// stat object being non-empty; see GameDetailModal.
export interface BoxscorePlayer {
  person: { id: number; fullName: string }
  position?: { abbreviation?: string }
  // Batting-order slot code: "100" = 1st slot starter, "101" = a substitute who
  // batted in the 1st slot. Absent for anyone who never came to the plate.
  battingOrder?: string
  stats?: {
    batting?: Partial<BoxscoreBatting>
    // MLB pre-formats the decision annotation here as "(W, 2-8)" / "(S, 18)";
    // don't rebuild it from liveData.decisions.
    pitching?: Partial<BoxscorePitching> & { note?: string }
  }
  seasonStats?: {
    batting?: { avg?: string }
    pitching?: { era?: string }
  }
}

export interface BoxscoreBatting {
  atBats: number
  runs: number
  hits: number
  rbi: number
  baseOnBalls: number
  strikeOuts: number
  doubles: number
  triples: number
  homeRuns: number
}

export interface BoxscorePitching {
  inningsPitched: string
  hits: number
  runs: number
  earnedRuns: number
  baseOnBalls: number
  strikeOuts: number
  homeRuns: number
}

export interface BoxscoreTeam {
  team: { id: number; name: string }
  players: Record<string, BoxscorePlayer>
  // Appearance order, and reliable — unlike `batters`, which appends the
  // pitchers to the end of the list.
  pitchers: number[]
}

interface LinescoreSide {
  runs?: number
  hits?: number
  errors?: number
}

// Trimmed shape of the v1.1 live feed's boxscore/linescore/decisions. The
// boxscore endpoint proper lives on api/v1, which the /api/mlb proxy does not
// map (MLB_ALLOWED sends /game/ to v1.1) — the live feed carries the same data
// and is already allowlisted, so this needs no backend change.
export interface GameBoxscore {
  gameData: {
    status: { abstractGameState: string; detailedState: string }
    datetime?: { officialDate?: string }
    teams: {
      home: { id: number; name: string; teamName?: string; abbreviation?: string }
      away: { id: number; name: string; teamName?: string; abbreviation?: string }
    }
  }
  liveData: {
    linescore?: {
      scheduledInnings?: number
      // Length varies: extra-inning games are common and 7-inning games exist,
      // so never assume nine entries.
      innings?: { num: number; home?: LinescoreSide; away?: LinescoreSide }[]
      teams?: { home?: LinescoreSide; away?: LinescoreSide }
    }
    boxscore?: { teams?: { home?: BoxscoreTeam; away?: BoxscoreTeam } }
    // Absent for games that haven't produced a decision yet.
    decisions?: {
      winner?: { id: number; fullName: string }
      loser?: { id: number; fullName: string }
      save?: { id: number; fullName: string }
    }
  }
}

// Same trick as LIVE_FEED_FIELDS: the raw feed is ~860KB, and this field list
// cuts it to ~39KB — still one request for the entire modal.
const BOXSCORE_FIELDS =
  'gameData,status,abstractGameState,detailedState,datetime,officialDate,' +
  'teams,home,away,id,name,teamName,abbreviation,liveData,linescore,innings,num,' +
  'runs,hits,errors,scheduledInnings,boxscore,players,person,fullName,position,' +
  'stats,batting,pitching,seasonStats,atBats,rbi,baseOnBalls,strikeOuts,homeRuns,' +
  'doubles,triples,avg,era,inningsPitched,earnedRuns,pitchers,battingOrder,' +
  'decisions,winner,loser,save,note'

export async function fetchBoxscore(gamePk: number): Promise<GameBoxscore> {
  return get(`/game/${gamePk}/feed/live?fields=${BOXSCORE_FIELDS}`)
}

interface OddsOutcome {
  name: string
  price: number
  point?: number
}

interface OddsMarket {
  key: 'h2h' | 'spreads'
  outcomes: OddsOutcome[]
}

interface OddsBookmaker {
  key: string
  markets: OddsMarket[]
}

export interface OddsGame {
  id: string
  home_team: string
  away_team: string
  bookmakers: OddsBookmaker[]
}

export function formatOdds(price: number): string {
  return price > 0 ? `+${price}` : `${price}`
}

// The backend holds the Odds API key and a shared 30-min cache; a 503 here
// means the server has no key configured (callers already fail soft).
export async function fetchOdds(): Promise<OddsGame[]> {
  const res = await fetch('/api/odds')
  if (!res.ok) throw new Error(`Odds API ${res.status}`)
  return res.json()
}
