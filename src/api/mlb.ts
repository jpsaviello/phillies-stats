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
export async function fetchWildCardStandings() {
  const data = await get<{ records: { teamRecords: import('../types/mlb').WildCardRecord[] }[] }>(
    `/standings?leagueId=104&season=${SEASON}&standingsTypes=wildCard`
  )
  return data.records[0]?.teamRecords ?? []
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
