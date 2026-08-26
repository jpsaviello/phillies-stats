import { useEffect, useState } from 'react'
import { fetchSchedule, teamLogoUrl, fetchOdds, formatOdds } from '../api/mlb'
import type { Game, OddsGame } from '../api/mlb'
import { getPhilliesOdds } from '../utils/odds'
import { firstPitch } from '../utils/gameTime'
import GameDetailModal from './GameDetailModal'
import { dismiss, navigate, useRoute } from '../hooks/useRoute'
import MatchupPreview from './MatchupPreview'
import { EmptyState, ErrorState, TableSkeleton } from './Feedback'

const PHILLIES_ID = 143

interface Props {
  enableGameDetail: boolean
  enableMatchupPreview: boolean
}

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })
}

export default function Schedule({ enableGameDetail, enableMatchupPreview }: Props) {
  const [dates, setDates] = useState<{ date: string; games: Game[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [odds, setOdds] = useState<OddsGame[]>([])
  // Which box score is open lives in the URL, so a game is linkable and Back
  // closes the modal instead of leaving the site. GameDetailModal fetches by
  // gamePk alone, so nothing else has to be restored alongside it.
  const { game: selectedGame } = useRoute()
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)
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
      .catch(e => {
        console.error('Failed to load schedule', e)
        setError("Couldn't load the schedule right now.")
      })
      .finally(() => setLoading(false))
  }, [reloadKey])

  if (loading) return <TableSkeleton rows={8} cols={4} />
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey(k => k + 1)} />
  if (!dates.length) return <EmptyState>No games in this window.</EmptyState>

  const _d = new Date()
  const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`

  const oddsMap = new Map<string, OddsGame>()
  for (const game of odds) {
    const key = [game.home_team, game.away_team].sort().join('|')
    if (!oddsMap.has(key)) oddsMap.set(key, game)
  }

  // The first game that hasn't started yet, for the matchup panel. Reuses the
  // schedule and odds this tab already fetched rather than fetching its own —
  // same arrangement as PlayoffPush taking divisionRecords from Standings.
  // Preview-only (not merely non-Final): once first pitch is thrown the panel's
  // job belongs to LiveGameStrip, and a stale Postponed game from the 14-day
  // lookback can't be picked because of the date >= today check.
  const upcoming = dates
    .flatMap(({ date, games }) => games.map(game => ({ date, game })))
    .find(({ date, game }) => date >= today && game.status.abstractGameState === 'Preview')

  let upcomingOdds: ReturnType<typeof getPhilliesOdds> = null
  if (upcoming && upcoming.date === today) {
    const { home, away } = upcoming.game.teams
    const oddsGame = oddsMap.get([home.team.name, away.team.name].sort().join('|'))
    if (oddsGame) upcomingOdds = getPhilliesOdds(oddsGame)
  }

  return (
    <>
    {enableMatchupPreview && upcoming && (
      <MatchupPreview
        game={upcoming.game}
        date={upcoming.date}
        philliesOdds={upcomingOdds}
      />
    )}
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
                onClick: () => navigate({ game: game.gamePk }),
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate({ game: game.gamePk })
                  }
                },
                role: 'button',
                tabIndex: 0,
                'aria-label': `Box score: ${isHome ? 'vs' : '@'} ${opponent}, ${formatDate(date)}`,
              })}
              // Hover is now reserved for rows that actually open something —
              // every row used to tint its border, and the clickable ones were
              // distinguished only by a 40%-opacity border, so the affordance
              // read as noise. Matches the tables' hover:bg-red-50.
              className={`flex items-center gap-4 px-4 py-3 bg-white rounded-lg border border-gray-100 transition-colors ${isToday ? 'border-l-4 border-l-phillies-red' : ''} ${clickable ? 'cursor-pointer hover:bg-red-50 hover:border-phillies-red/40 focus:outline-none focus:ring-2 focus:ring-phillies-red/40' : ''}`}
            >
              <div className="text-sm text-gray-500 w-24 shrink-0">
                {formatDate(date)}
                {isToday && <span className="ml-2 text-xs font-bold text-phillies-red uppercase">Today</span>}
              </div>
              <div className="text-sm text-gray-500 w-6 text-center">{isHome ? 'vs' : '@'}</div>
              <img
                src={teamLogoUrl(opponentId)}
                alt={opponent}
                className="w-6 h-6 shrink-0"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
              <div className="flex-1 min-w-0">
                {/* truncate: at 375px this column gets ~100px, and a long club
                    name wrapped to two lines and changed the row height. */}
                <div className="font-medium text-gray-900 truncate">{opponent}</div>
                {philliesOdds && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    ML {formatOdds(philliesOdds.ml)}{'  |  '}RL {philliesOdds.rlPoint > 0 ? '+' : ''}{philliesOdds.rlPoint} ({formatOdds(philliesOdds.rlJuice)})
                  </div>
                )}
              </div>
              {isFinished ? (
                <div className={`text-sm font-semibold tabular-nums ${won ? 'text-green-600' : 'text-red-600'}`}>
                  {won ? 'W' : 'L'} {philliesScore}–{oppScore}
                </div>
              ) : (
                <div className="text-sm text-gray-500 tabular-nums">
                  {firstPitch(game) ?? game.status.detailedState}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
    {selectedGame != null && (
      <GameDetailModal gamePk={selectedGame} onClose={() => dismiss({ game: null })} />
    )}
    </>
  )
}
