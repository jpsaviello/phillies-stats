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
    `/stats?stats=season&group=hitting&season=${SEASON}&sportId=1&teamId=${PHILLIES_ID}&playerPool=ALL`
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

export interface Game {
  gamePk: number
  gameDate: string
  status: { detailedState: string }
  teams: {
    home: { team: { id: number; name: string }; score?: number; isWinner?: boolean }
    away: { team: { id: number; name: string }; score?: number; isWinner?: boolean }
  }
}
