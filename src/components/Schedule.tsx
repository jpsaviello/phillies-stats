import { useEffect, useRef, useState } from 'react'
import { fetchSchedule, teamLogoUrl, fetchOdds, formatOdds } from '../api/mlb'
import type { Game, OddsGame } from '../api/mlb'
import { getPhilliesOdds } from '../utils/odds'
import { firstPitch } from '../utils/gameTime'
import { scrollBehavior } from '../utils/motion'
import { easternToday, formatDate, shiftDate } from '../utils/date'
import GameDetailModal from './GameDetailModal'
import { dismiss, navigate, useRoute } from '../hooks/useRoute'
import MatchupPreview from './MatchupPreview'
import { EmptyState, ErrorState, TableSkeleton } from './Feedback'

const PHILLIES_ID = 143

interface Props {
  enableGameDetail: boolean
  enableMatchupPreview: boolean
  enableGameStory: boolean
}

export default function Schedule({ enableGameDetail, enableMatchupPreview, enableGameStory }: Props) {
  const [dates, setDates] = useState<{ date: string; games: Game[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [odds, setOdds] = useState<OddsGame[]>([])
  // Which box score is open lives in the URL, so a game is linkable and Back
  // closes the modal instead of leaving the site. GameDetailModal fetches by
  // gamePk alone, so nothing else has to be restored alongside it.
  const { game: selectedGame } = useRoute()
  const [reloadKey, setReloadKey] = useState(0)
  // The row the jump button targets: today's game, or the next one when today is
  // an off day. Deliberately NOT scrolled to on mount — that would jump straight
  // past MatchupPreview, the panel this tab renders above the list on purpose,
  // and moving someone's scroll position on arrival is disorienting even when
  // the destination is right.
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [flash, setFlash] = useState(false)

  // Clears the jump highlight. Held in a ref so an unmount mid-flash (a tab
  // switch) can't leave a timer that sets state on a dead component.
  const flashTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  function jumpToAnchor() {
    const el = anchorRef.current
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: scrollBehavior() })
    setFlash(true)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(false), 1500)
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    // Two weeks either side of the BASEBALL day, not the visitor's own. MLB
    // dates every game by its Eastern calendar day, so a fan on the west coast
    // watching a night game is already on tomorrow's date locally and would be
    // handed a window shifted a day off the schedule they are looking at.
    const today = easternToday()
    Promise.all([
      fetchSchedule(shiftDate(today, -14), shiftDate(today, 14)),
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

  // Same definition of "today" the fetch above used, so the jump anchor and the
  // upcoming-game pick can't land on a different day than the window they came
  // from.
  const today = easternToday()

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

  // The date whose first row gets the anchor ref: today when today has a game,
  // otherwise the next dated game in the window. Undefined in a window with
  // nothing today or later, which is what hides the button.
  const flat = dates.flatMap(({ date, games }) => games.map(game => ({ date, game })))
  const anchorDate = flat.find(({ date }) => date === today)?.date
    ?? flat.find(({ date }) => date > today)?.date
  const anchorIsToday = anchorDate === today
  let anchorPlaced = false

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
    <div className="max-w-2xl">
      {anchorDate && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={jumpToAnchor}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-mark transition-colors hover:border-phillies-red hover:text-live focus:outline-none focus-visible:ring-2 focus-visible:ring-phillies-red/40"
          >
            {/* The list runs oldest first over today ± 14 days, so without this
                the tab opens on a game from two weeks ago. */}
            {anchorIsToday ? 'Jump to today' : 'Jump to next game'}
          </button>
        </div>
      )}
    <div className="space-y-2">
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
          // First row of the anchor date only — a doubleheader must not hand the
          // ref to its second game and leave the first scrolled off screen.
          const isAnchor = date === anchorDate && !anchorPlaced
          if (isAnchor) anchorPlaced = true

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
              ref={isAnchor ? anchorRef : undefined}
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
                'aria-label': `Box score: ${isHome ? 'vs' : '@'} ${opponent}, ${formatDate(date, { month: 'short', day: 'numeric', weekday: 'short' })}`,
              })}
              // Hover is now reserved for rows that actually open something —
              // every row used to tint its border, and the clickable ones were
              // distinguished only by a 40%-opacity border, so the affordance
              // read as noise. Matches the tables' hover:bg-hover.
              className={`flex items-center gap-4 px-4 py-3 bg-panel rounded-lg border border-gray-100 transition-colors ${isToday ? 'border-phillies-red' : ''} ${clickable ? 'cursor-pointer hover:bg-hover hover:border-phillies-red/40 focus:outline-none focus:ring-2 focus:ring-phillies-red/40' : ''} ${isAnchor && flash ? 'ring-2 ring-phillies-red/60' : ''}`}
            >
              <div className="text-sm text-gray-500 w-24 shrink-0">
                {formatDate(date, { month: 'short', day: 'numeric', weekday: 'short' })}
                {isToday && <span className="ml-2 text-xs font-bold text-live uppercase">Today</span>}
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
    </div>
    {selectedGame != null && (
      <GameDetailModal
        gamePk={selectedGame}
        enableGameStory={enableGameStory}
        onClose={() => dismiss({ game: null })}
      />
    )}
    </>
  )
}
