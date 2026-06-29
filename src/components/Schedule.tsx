import { useEffect, useState } from 'react'
import { fetchSchedule } from '../api/mlb'
import type { Game } from '../api/mlb'

const PHILLIES_ID = 143

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })
}

export default function Schedule() {
  const [dates, setDates] = useState<{ date: string; games: Game[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const now = new Date()
    const start = new Date(now)
    start.setDate(now.getDate() - 14)
    const end = new Date(now)
    end.setDate(now.getDate() + 14)
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    fetchSchedule(fmt(start), fmt(end))
      .then(setDates)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-500">Loading schedule…</div>
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>
  if (!dates.length) return <div className="p-8 text-center text-gray-500">No games found.</div>

  return (
    <div className="max-w-2xl space-y-2">
      {dates.map(({ date, games }) =>
        games.map(game => {
          const isHome = game.teams.home.team.id === PHILLIES_ID
          const opponent = isHome ? game.teams.away.team.name : game.teams.home.team.name
          const philliesScore = isHome ? game.teams.home.score : game.teams.away.score
          const oppScore = isHome ? game.teams.away.score : game.teams.home.score
          const isFinished = game.status.detailedState === 'Final'
          const won = isHome ? game.teams.home.isWinner : game.teams.away.isWinner

          return (
            <div key={game.gamePk} className="flex items-center gap-4 px-4 py-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
              <div className="text-sm text-gray-500 w-24 shrink-0">{formatDate(date)}</div>
              <div className="text-sm text-gray-400 w-6 text-center">{isHome ? 'vs' : '@'}</div>
              <div className="font-medium text-gray-900 flex-1">{opponent}</div>
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
  )
}
