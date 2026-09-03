import { useEffect, useMemo, useState } from 'react'
import {
  fetchBullpenBoxscore,
  fetchOdds,
  fetchSchedule,
  formatOdds,
  teamLogoUrl,
} from '../api/mlb'
import type { Game, OddsGame } from '../api/mlb'
import { getPhilliesOdds } from '../utils/odds'
import { easternToday, formatDate, shiftDate } from '../utils/date'
import { firstPitch } from '../utils/gameTime'
import { extractTeamPitchers } from '../utils/bullpen'
import type { RawAppearance } from '../utils/bullpen'
import { inningsToOuts, outsToInnings } from '../utils/innings'
import { pickHeadline, recentResults, recordOver } from '../utils/today'
import type { DatedGame } from '../utils/today'
import MatchupPreview from './MatchupPreview'
import GameDetailModal from './GameDetailModal'
import { dismiss, navigate, useRoute } from '../hooks/useRoute'
import { EmptyState, ErrorState, TableSkeleton } from './Feedback'

const PHILLIES_ID = 143

/** How far back the recent-results strip reaches. */
const RECENT_RESULTS = 10

interface Props {
  enableGameDetail: boolean
  enableMatchupPreview: boolean
  enableGameStory: boolean
}

function hideOnError(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = 'none'
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

/**
 * The tab's landing view: what matters about the Phillies right now, in the
 * order a fan asks it — is a game on, who's pitching, what happened last night,
 * how have they been playing.
 *
 * Every other tab in this app answers a question about the season. This one
 * answers a question about the day, which is why it is the default route: the
 * app previously opened on a season-long batting table, several cards below the
 * thing most visitors came for.
 *
 * It fetches ONE schedule window and derives all four sections from it, plus a
 * single box score for the bullpen line. MatchupPreview is handed the game and
 * odds this component already has rather than fetching its own, the same
 * arrangement Schedule uses — see the matchup-preview notes in CLAUDE.md.
 */
export default function Today({ enableGameDetail, enableMatchupPreview, enableGameStory }: Props) {
  const [games, setGames] = useState<DatedGame[]>([])
  const [odds, setOdds] = useState<OddsGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Which box score is open lives in the URL, exactly as on the Schedule tab,
  // so a game opened from here is linkable and Back closes it.
  const { game: selectedGame } = useRoute()

  // The baseball day, never the visitor's own — see baseballDay in utils/date.
  const today = easternToday()

  useEffect(() => {
    setLoading(true)
    setError(null)
    // Ten days back covers the last completed game across an off day or two and
    // fills the recent-results strip; a week forward reaches the next game even
    // over the All-Star break.
    Promise.all([
      fetchSchedule(shiftDate(today, -10), shiftDate(today, 7)),
      // Odds decorate the headline card and must never be able to take the game
      // itself down with them.
      fetchOdds().catch(() => [] as OddsGame[]),
    ])
      .then(([dates, oddsData]) => {
        setGames(dates.flatMap(d => d.games.map(game => ({ game, date: d.date }))))
        setOdds(oddsData)
      })
      .catch(e => {
        console.error("Failed to load today's games", e)
        setError("Couldn't load today's game right now.")
      })
      .finally(() => setLoading(false))
  }, [today, reloadKey])

  // Newest first, and the last of them is the game the recap card describes.
  const recent = useMemo(() => recentResults(games, RECENT_RESULTS), [games])
  const lastGame = recent[0] ?? null

  const headline = useMemo(() => pickHeadline(games, today), [games, today])

  const headlineOdds = useMemo(() => {
    if (!headline || headline.date !== today || headline.game.status.abstractGameState !== 'Preview') return null
    const key = ['Philadelphia Phillies', gameView(headline.game).opponent].sort().join('|')
    const priced = odds.find(o => [o.home_team, o.away_team].sort().join('|') === key)
    return priced ? getPhilliesOdds(priced) : null
  }, [headline, odds, today])

  // The pitchers who worked the last completed game. One box score, reusing the
  // same trimmed endpoint and the same extraction BullpenUsage uses — this is
  // deliberately "who was used last night" rather than the full seven-day
  // workload panel, which stays on the Pitching tab where it costs a fetch per
  // game in the window.
  const [relief, setRelief] = useState<RawAppearance[]>([])
  useEffect(() => {
    if (!lastGame) {
      setRelief([])
      return
    }
    let current = true
    fetchBullpenBoxscore(lastGame.game.gamePk)
      .then(box => {
        // A late-arriving response for a game that is no longer the last one
        // must not overwrite the current one.
        if (current) setRelief(extractTeamPitchers(box, PHILLIES_ID, lastGame.game.gamePk, lastGame.date))
      })
      // Self-hides, same convention as every other panel here.
      .catch(() => { if (current) setRelief([]) })
    return () => { current = false }
  }, [lastGame])

  const recentRecord = useMemo(() => recordOver(recent, PHILLIES_ID), [recent])

  function openGame(gamePk: number) {
    navigate({ game: gamePk })
  }

  if (loading) return <TableSkeleton rows={6} cols={4} />
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey(k => k + 1)} />
  if (!games.length) return <EmptyState>No games scheduled right now.</EmptyState>

  const head = headline && gameView(headline.game)
  const isLive = headline?.game.status.abstractGameState === 'Live'
  const last = lastGame && gameView(lastGame.game)
  // Same rule the Schedule tab uses: a game that hasn't started has no
  // linescore, batting order or decisions, so there is nothing to open.
  const lastClickable = enableGameDetail && lastGame !== null

  return (
    <>
      <div className="space-y-6">
        {/* ---- What's on now ------------------------------------------- */}
        {headline && head && (
          <section className="card p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="card-label">
                {isLive ? <span className="text-phillies-red">Live now</span> : 'Next game'}
              </h2>
              <span className="text-sm text-gray-500">
                {formatDate(headline.date, { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-3 min-w-0">
              <img
                src={teamLogoUrl(head.opponentId)}
                alt={head.opponent}
                className="w-12 h-12 shrink-0"
                onError={hideOnError}
              />
              <div className="min-w-0">
                <div className="font-display text-2xl sm:text-3xl font-bold text-phillies-navy truncate">
                  {head.isHome ? 'vs' : '@'} {head.opponent}
                </div>
                <div className="text-sm text-gray-600 mt-0.5 tabular-nums">
                  {isLive
                    ? headline.game.status.detailedState
                    : firstPitch(headline.game) ?? headline.game.status.detailedState}
                </div>
              </div>
            </div>

            {headlineOdds && (
              <div className="mt-3 text-sm text-gray-500 tabular-nums">
                ML {formatOdds(headlineOdds.ml)}
                {'  |  '}
                RL {headlineOdds.rlPoint > 0 ? '+' : ''}{headlineOdds.rlPoint} ({formatOdds(headlineOdds.rlJuice)})
              </div>
            )}

            {isLive && enableGameDetail && (
              <button
                type="button"
                onClick={() => openGame(headline.game.gamePk)}
                className="mt-4 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-phillies-navy transition-colors hover:border-phillies-red hover:text-phillies-red focus:outline-none focus-visible:ring-2 focus-visible:ring-phillies-red/40"
              >
                View box score
              </button>
            )}
          </section>
        )}

        {/* MLB doesn't post probables until roughly two days out, so this panel
            self-hides for most of any week — that's the normal state, not an
            error. It fetches each starter's line itself; the game and its odds
            come from the window above. */}
        {enableMatchupPreview && headline && !isLive && (
          <MatchupPreview game={headline.game} date={headline.date} philliesOdds={headlineOdds} />
        )}

        {/* ---- Last game ----------------------------------------------- */}
        {lastGame && last && (
          <section className="card p-5">
            <h2 className="card-label">Last game</h2>
            <div className="mt-3 flex items-center gap-3 min-w-0">
              <img
                src={teamLogoUrl(last.opponentId)}
                alt={last.opponent}
                className="w-10 h-10 shrink-0"
                onError={hideOnError}
              />
              <div className="min-w-0 flex-1">
                <div className="font-display text-xl font-bold text-phillies-navy truncate">
                  <span className={last.won ? 'text-green-600' : 'text-red-600'}>{last.won ? 'W' : 'L'}</span>{' '}
                  {last.philliesScore}–{last.oppScore}
                </div>
                <div className="text-sm text-gray-600 truncate">
                  {last.isHome ? 'vs' : '@'} {last.opponent} ·{' '}
                  {formatDate(lastGame.date, { month: 'short', day: 'numeric' })}
                </div>
              </div>
              {lastClickable && (
                <button
                  type="button"
                  onClick={() => openGame(lastGame.game.gamePk)}
                  className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-phillies-navy transition-colors hover:border-phillies-red hover:text-phillies-red focus:outline-none focus-visible:ring-2 focus-visible:ring-phillies-red/40"
                >
                  Box score
                </button>
              )}
            </div>

            {relief.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <div className="card-label">Who pitched</div>
                <ul className="mt-2 space-y-1">
                  {relief.map(p => (
                    <li key={p.playerId} className="flex items-baseline gap-2 text-sm">
                      <span className="text-gray-900 truncate">{p.name}</span>
                      {p.wasStart && <span className="card-label shrink-0">SP</span>}
                      <span className="flex-1 border-b border-dotted border-gray-200" aria-hidden="true" />
                      <span className="shrink-0 tabular-nums text-gray-600">
                        {outsToInnings(inningsToOuts(p.inningsPitched))} IP
                        {p.pitches > 0 && ` · ${p.pitches} P`}
                      </span>
                    </li>
                  ))}
                </ul>
                {/* States what was thrown and stops there. Whether any of these
                    arms is available tonight depends on score, leverage and
                    training-staff information this app does not have — the same
                    line BullpenUsage holds. */}
                <p className="mt-2 text-xs text-gray-500">
                  Workload only. Availability isn’t implied — see the Pitching tab for the full seven-day window.
                </p>
              </div>
            )}
          </section>
        )}

        {/* ---- Recent results ------------------------------------------ */}
        {recent.length > 0 && (
          <section className="card p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="card-label">Last {recent.length}</h2>
              <span className="font-display font-bold text-phillies-navy tabular-nums">
                {recentRecord.wins}–{recentRecord.losses}
              </span>
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {recent.map(({ game, date }) => {
                const view = gameView(game)
                const label = `${view.won ? 'Won' : 'Lost'} ${view.philliesScore}–${view.oppScore} ${view.isHome ? 'vs' : 'at'} ${view.opponent}, ${formatDate(date, { month: 'short', day: 'numeric' })}`
                return (
                  <li key={game.gamePk}>
                    {enableGameDetail ? (
                      <button
                        type="button"
                        onClick={() => openGame(game.gamePk)}
                        aria-label={`Box score: ${label}`}
                        className={`rounded-md px-2 py-1 font-display text-sm font-bold tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-phillies-red/40 ${
                          view.won ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-red-50 text-red-700 hover:bg-red-100'
                        }`}
                      >
                        {view.won ? 'W' : 'L'} {view.philliesScore}–{view.oppScore}
                      </button>
                    ) : (
                      <span
                        title={label}
                        className={`inline-block rounded-md px-2 py-1 font-display text-sm font-bold tabular-nums ${
                          view.won ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {view.won ? 'W' : 'L'} {view.philliesScore}–{view.oppScore}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
            {/* Most recent first — the opposite of the Schedule tab's list,
                which reads forward through the season. */}
            <p className="mt-2 text-xs text-gray-500">Most recent first.</p>
          </section>
        )}
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
