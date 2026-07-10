import type { GameLogSplit } from '../types/mlb'

const BASE = 'https://statsapi.mlb.com/api/v1'
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
  // API returns the season's splits oldest-first, so take the tail and reverse
  // to get the 10 most recent games, most recent first.
  return (data.stats[0]?.splits ?? []).slice(-10).reverse()
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
  status: { detailedState: string }
  teams: {
    home: { team: { id: number; name: string }; score?: number; isWinner?: boolean }
    away: { team: { id: number; name: string }; score?: number; isWinner?: boolean }
  }
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

// v2: prices switched from decimal to American format; new key so stale
// decimal entries are never read.
const ODDS_CACHE_KEY = 'phillies_odds_cache_v2'
const ODDS_CACHE_TTL = 30 * 60 * 1000

export async function fetchOdds(): Promise<OddsGame[]> {
  const raw = localStorage.getItem(ODDS_CACHE_KEY)
  if (raw) {
    try {
      const cached: { timestamp: number; data: OddsGame[] } = JSON.parse(raw)
      if (Date.now() - cached.timestamp < ODDS_CACHE_TTL) return cached.data
    } catch {
      localStorage.removeItem(ODDS_CACHE_KEY)
    }
  }
  const key = import.meta.env.VITE_ODDS_API_KEY as string
  const url =
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/` +
    `?apiKey=${key}&regions=us&markets=h2h,spreads&bookmakers=draftkings&oddsFormat=american`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Odds API ${res.status}`)
  const data: OddsGame[] = await res.json()
  localStorage.setItem(ODDS_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }))
  return data
}
