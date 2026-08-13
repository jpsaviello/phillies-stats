import { useEffect, useState } from 'react'
import { fetchSchedule, teamLogoUrl, fetchOdds, formatOdds } from '../api/mlb'
import type { Game, OddsGame } from '../api/mlb'
import { getPhilliesOdds } from '../utils/odds'
import GameDetailModal from './GameDetailModal'

const PHILLIES_ID = 143

interface Props {
  enableGameDetail: boolean
}

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })
}

export default function Schedule({ enableGameDetail }: Props) {
  const [dates, setDates] = useState<{ date: string; games: Game[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [odds, setOdds] = useState<OddsGame[]>([])
  const [selectedGame, setSelectedGame] = useState<number | null>(null)

  useEffect(() => {
    const now = new Date()
    const start = new Date(now)
    start.setDate(now.getDate() - 14)
    const end = new Date(now)
    end.setDate(now.getDate() + 14)
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    Promise.all([
      fetchSchedule(fmt(start), fmt(end)),
      fetchOdds().catch(() => [] as OddsGame[]),
    ])
      .then(([scheduleData, oddsData]) => {
        setDates(scheduleData)
        setOdds(oddsData)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-500">Loading schedule…</div>
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>
  if (!dates.length) return <div className="p-8 text-center text-gray-500">No games found.</div>

  const _d = new Date()
  const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`

  const oddsMap = new Map<string, OddsGame>()
  for (const game of odds) {
    const key = [game.home_team, game.away_team].sort().join('|')
    if (!oddsMap.has(key)) oddsMap.set(key, game)
  }

  return (
    <>
    <div className="max-w-2xl space-y-2">
      {dates.map(({ date, games }) =>
        games.map(game => {
          const isHome = game.teams.home.team.id === PHILLIES_ID
          const opponent = isHome ? game.teams.away.team.name : game.teams.home.team.name
          const philliesScore = isHome ? game.teams.home.score : game.teams.away.score
          const oppScore = isHome ? game.teams.away.score : game.teams.home.score
          const isFinished = game.status.detailedState === 'Final'
          const won = isHome ? game.teams.home.isWinner : game.teams.away.isWinner
          const opponentId = isHome ? game.teams.away.team.id : game.teams.home.team.id
          const isToday = date === today

          const oddsKey = ['Philadelphia Phillies', opponent].sort().join('|')
          const oddsGame = oddsMap.get(oddsKey)
          const philliesOdds = !isFinished && isToday && oddsGame ? getPhilliesOdds(oddsGame) : null

          // A game that hasn't started has no linescore, no batting order and no
          // decisions, so there is nothing to open. In-progress games are fair
          // game — the modal shows the innings played so far.
          const clickable = enableGameDetail && game.status.abstractGameState !== 'Preview'

          return (
            <div
              key={game.gamePk}
              {...(clickable && {
                onClick: () => setSelectedGame(game.gamePk),
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedGame(game.gamePk)
                  }
                },
                role: 'button',
                tabIndex: 0,
                'aria-label': `Box score: ${isHome ? 'vs' : '@'} ${opponent}, ${formatDate(date)}`,
              })}
              className={`flex items-center gap-4 px-4 py-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-colors ${isToday ? 'border-l-4 border-l-phillies-red' : ''} ${clickable ? 'cursor-pointer hover:border-phillies-red/40 focus:outline-none focus:ring-2 focus:ring-phillies-red/40' : ''}`}
            >
              <div className="text-sm text-gray-500 w-24 shrink-0">
                {formatDate(date)}
                {isToday && <span className="ml-2 text-xs font-bold text-phillies-red uppercase">Today</span>}
              </div>
              <div className="text-sm text-gray-400 w-6 text-center">{isHome ? 'vs' : '@'}</div>
              <img
                src={teamLogoUrl(opponentId)}
                alt={opponent}
                className="w-6 h-6 shrink-0"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900">{opponent}</div>
                {philliesOdds && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    ML {formatOdds(philliesOdds.ml)}{'  |  '}RL {philliesOdds.rlPoint > 0 ? '+' : ''}{philliesOdds.rlPoint} ({formatOdds(philliesOdds.rlJuice)})
                  </div>
                )}
              </div>
              {isFinished ? (
                <div className={`text-sm font-semibold tabular-nums ${won ? 'text-green-600' : 'text-red-600'}`}>
                  {won ? 'W' : 'L'} {philliesScore}–{oppScore}
                </div>
              ) : (
                <div className="text-sm text-gray-400">{game.status.detailedState}</div>
              )}
            </div>
          )
        })
      )}
    </div>
    {selectedGame != null && (
      <GameDetailModal gamePk={selectedGame} onClose={() => setSelectedGame(null)} />
    )}
    </>
  )
}
