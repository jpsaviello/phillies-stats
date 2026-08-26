import { useEffect, useState } from 'react'
import {
  fetchStandings,
  fetchSchedule,
  fetchBattingStats,
  fetchPitchingStats,
  fetchOdds,
  teamLogoUrl,
  playerHeadshotUrl,
  formatOdds,
} from '../api/mlb'
import type { Game, OddsGame } from '../api/mlb'
import type { Player, StandingsRecord } from '../types/mlb'
import { getPhilliesOdds } from '../utils/odds'

const PHILLIES_ID = 143

// States before first pitch — anything else shows its live detailedState
// instead of the scheduled time.
const PREGAME_STATES = ['Scheduled', 'Pre-Game', 'Warmup']

interface Leader {
  player: Player
  value: string
}

interface ScheduledGame {
  game: Game
  date: string
}

interface HeroData {
  record: StandingsRecord
  lastGame: ScheduledGame | null
  nextGame: ScheduledGame | null
  nextOdds: ReturnType<typeof getPhilliesOdds>
  leaders: { label: string; leader: Leader | null }[]
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ordinal(rank: string) {
  const n = parseInt(rank, 10)
  if (Number.isNaN(n)) return rank
  const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'
  return `${n}${suffix}`
}

function lastName(player: Player) {
  return player.fullName.split(' ').slice(1).join(' ') || player.fullName
}

function maxBy<T>(items: T[], score: (item: T) => number): T | null {
  let best: T | null = null
  let bestScore = -Infinity
  for (const item of items) {
    const s = score(item)
    if (s > bestScore) {
      bestScore = s
      best = item
    }
  }
  return best
}

function gameView(game: Game) {
  const isHome = game.teams.home.team.id === PHILLIES_ID
  const us = isHome ? game.teams.home : game.teams.away
  const opp = isHome ? game.teams.away : game.teams.home
  return {
    isHome,
    opponent: opp.team.name,
    opponentId: opp.team.id,
    philliesScore: us.score,
    oppScore: opp.score,
    won: us.isWinner,
  }
}

function hideOnError(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = 'none'
}

export default function HeroStrip() {
  const [data, setData] = useState<HeroData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const now = new Date()
    const start = new Date(now)
    start.setDate(now.getDate() - 10)
    const end = new Date(now)
    end.setDate(now.getDate() + 7)
    const today = fmtDate(now)

    Promise.all([
      fetchStandings(),
      fetchSchedule(fmtDate(start), fmtDate(end)),
      fetchBattingStats(),
      fetchPitchingStats(),
      fetchOdds().catch(() => [] as OddsGame[]),
    ])
      .then(([standings, dates, batting, pitching, odds]) => {
        const record = standings.find(r => r.team.id === PHILLIES_ID)
        if (!record) {
          setFailed(true)
          return
        }
        const teamGames = record.wins + record.losses

        const games: ScheduledGame[] = dates.flatMap(d =>
          d.games.map(game => ({ game, date: d.date }))
        )
        const finals = games.filter(g => g.game.status.detailedState === 'Final')
        const lastGame = finals[finals.length - 1] ?? null
        // Prefer today-or-later so a stale Postponed/Suspended game from the
        // 10-day lookback can't monopolize the Next Game card.
        const nonFinal = games.filter(g => g.game.status.detailedState !== 'Final')
        const nextGame = nonFinal.find(g => g.date >= today) ?? nonFinal[0] ?? null

        // Odds only for a today game, same policy as the Schedule tab.
        let nextOdds: ReturnType<typeof getPhilliesOdds> = null
        if (nextGame && nextGame.date === today) {
          const { opponent } = gameView(nextGame.game)
          const key = ['Philadelphia Phillies', opponent].sort().join('|')
          const oddsGame = odds.find(
            o => [o.home_team, o.away_team].sort().join('|') === key
          )
          if (oddsGame) nextOdds = getPhilliesOdds(oddsGame)
        }

        // AVG qualification approximates the official 3.1 PA/game rule;
        // fall back to any batter with an AB early in the season. Thresholds
        // are floored at 1 so teamGames === 0 can't admit 0-AB/0-IP players.
        const qualified = batting.filter(s => s.stat.atBats >= Math.max(1, 2 * teamGames))
        const avgPool = qualified.length ? qualified : batting.filter(s => s.stat.atBats >= 1)
        const avgLeader = maxBy(avgPool, s => parseFloat(s.stat.avg))
        const hrLeader = maxBy(batting, s => s.stat.homeRuns)
        const eraLeader = maxBy(
          pitching.filter(s => parseFloat(s.stat.inningsPitched) >= Math.max(1, teamGames)),
          s => -parseFloat(s.stat.era)
        )

        setData({
          record,
          lastGame,
          nextGame,
          nextOdds,
          leaders: [
            { label: 'AVG', leader: avgLeader && { player: avgLeader.player, value: avgLeader.stat.avg } },
            { label: 'HR', leader: hrLeader && { player: hrLeader.player, value: `${hrLeader.stat.homeRuns}` } },
            { label: 'ERA', leader: eraLeader && { player: eraLeader.player, value: eraLeader.stat.era } },
          ],
        })
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 pt-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-28 rounded-xl border border-gray-200 bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }
  // The strip only summarizes data the tabs already expose, so on any MLB
  // fetch failure it disappears instead of showing an error on every tab.
  if (failed || !data) return null

  const { record, lastGame, nextGame, nextOdds, leaders } = data
  const rank = `${ordinal(record.divisionRank)} NL East`
  const subtitle = record.gamesBack === '-' ? rank : `${rank} · ${record.gamesBack} GB`

  const last = lastGame && gameView(lastGame.game)
  const next = nextGame && gameView(nextGame.game)
  const nextDate = nextGame && new Date(nextGame.game.gameDate)
  const nextIsLive = nextGame && !PREGAME_STATES.includes(nextGame.game.status.detailedState)

  return (
    <div className="max-w-7xl mx-auto px-4 pt-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card px-4 py-3">
          <div className="card-label">Record</div>
          <div className="font-display text-3xl font-bold text-phillies-navy tabular-nums mt-1">
            {record.wins}–{record.losses}
          </div>
          <div className="text-sm text-gray-500 mt-0.5">{subtitle}</div>
        </div>

        <div className="card px-4 py-3">
          <div className="card-label">Last Game</div>
          {lastGame && last ? (
            <>
              <div className="font-display text-xl font-bold text-phillies-navy tabular-nums mt-1">
                <span className={last.won ? 'text-green-600' : 'text-red-600'}>{last.won ? 'W' : 'L'}</span>{' '}
                {last.philliesScore}–{last.oppScore}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-600 mt-1 min-w-0">
                <img
                  src={teamLogoUrl(last.opponentId)}
                  alt={last.opponent}
                  className="w-5 h-5 shrink-0"
                  onError={hideOnError}
                />
                <span className="truncate">{last.isHome ? 'vs' : '@'} {last.opponent}</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {new Date(lastGame.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </>
          ) : (
            <div className="font-display text-xl font-bold text-gray-400 mt-1">—</div>
          )}
        </div>

        <div className="card px-4 py-3">
          <div className="card-label">Next Game</div>
          {nextGame && next && nextDate ? (
            <>
              <div className="flex items-center gap-1.5 mt-1 min-w-0">
                <img
                  src={teamLogoUrl(next.opponentId)}
                  alt={next.opponent}
                  className="w-6 h-6 shrink-0"
                  onError={hideOnError}
                />
                <span className="font-display text-xl font-bold text-phillies-navy truncate">
                  {next.isHome ? 'vs' : '@'} {next.opponent}
                </span>
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {nextIsLive
                  ? nextGame.game.status.detailedState
                  : `${nextDate.toLocaleDateString('en-US', { weekday: 'short' })} ${nextDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
              </div>
              {nextOdds && (
                <div className="text-xs text-gray-500 mt-0.5">ML {formatOdds(nextOdds.ml)}</div>
              )}
            </>
          ) : (
            <div className="font-display text-xl font-bold text-gray-400 mt-1">—</div>
          )}
        </div>

        <div className="card px-4 py-3">
          <div className="card-label">Team Leaders</div>
          <div className="mt-1.5 space-y-1.5">
            {leaders.map(({ label, leader }) => (
              <div key={label} className="flex items-center gap-2 min-w-0">
                {leader ? (
                  <>
                    <img
                      src={playerHeadshotUrl(leader.player.id)}
                      alt={leader.player.fullName}
                      className="w-6 h-6 rounded-full shrink-0 object-cover"
                      onError={hideOnError}
                    />
                    <span className="card-label w-8 shrink-0">
                      {label}
                    </span>
                    <span className="font-display font-bold text-phillies-navy tabular-nums">
                      {leader.value}
                    </span>
                    <span className="text-sm text-gray-600 truncate">{lastName(leader.player)}</span>
                  </>
                ) : (
                  <>
                    <span className="card-label w-8 shrink-0">
                      {label}
                    </span>
                    <span className="text-gray-400">—</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
