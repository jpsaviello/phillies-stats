import { useEffect, useState } from 'react'
import {
  fetchLiveFeed,
  fetchSchedule,
  playerHeadshotUrl,
  teamLogoUrl,
  type LiveFeed,
} from '../api/mlb'

// Cheap gate: today's schedule (~1KB) tells us whether a game is live before
// we ever touch the feed. The feed itself refreshes faster while a game is on.
const SCHEDULE_POLL_MS = 60_000
const FEED_POLL_MS = 15_000

// Dev/test override: ?liveGamePk=<pk> skips the schedule gate and the Live
// check so the strip renders from any game's feed — MLB serves the feed for
// finished games too, which makes live rendering testable on demand.
const overridePk =
  Number(new URLSearchParams(window.location.search).get('liveGamePk')) || null

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hideOnError(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = 'none'
}

export default function LiveGameStrip() {
  const [gamePk, setGamePk] = useState<number | null>(overridePk)
  const [feed, setFeed] = useState<LiveFeed | null>(null)

  useEffect(() => {
    if (overridePk) return

    const check = () => {
      if (document.hidden) return
      const today = fmtDate(new Date())
      fetchSchedule(today, today)
        .then(dates => {
          const games = dates.flatMap(d => d.games)
          const live = games.find(g => g.status.abstractGameState === 'Live')
          setGamePk(live?.gamePk ?? null)
        })
        .catch(() => setGamePk(null))
    }

    check()
    const id = setInterval(check, SCHEDULE_POLL_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (gamePk == null) {
      setFeed(null)
      return
    }

    const poll = () => {
      if (document.hidden) return
      fetchLiveFeed(gamePk)
        .then(f => {
          // Hide within one feed tick on game end (walk-off) instead of
          // waiting for the slower schedule poll to notice.
          if (!overridePk && f.gameData.status.abstractGameState !== 'Live') {
            setGamePk(null)
            return
          }
          setFeed(f)
        })
        .catch(() => setFeed(null))
    }

    poll()
    const id = setInterval(poll, FEED_POLL_MS)
    return () => clearInterval(id)
  }, [gamePk])

  const linescore = feed?.liveData.linescore
  if (!feed || !linescore) return null

  const matchup = feed.liveData.plays.currentPlay?.matchup
  const outs = linescore.outs ?? 0

  return (
    <div className="max-w-7xl mx-auto px-4 pt-6">
      <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-phillies-red px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-phillies-red animate-pulse" />
          <span className="font-display text-xs uppercase tracking-wider text-phillies-red font-bold">
            Live
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img
              src={teamLogoUrl(feed.gameData.teams.away.id)}
              alt=""
              className="w-8 h-8"
              onError={hideOnError}
            />
            <span className="font-display text-3xl font-bold text-phillies-navy tabular-nums">
              {linescore.teams.away.runs ?? 0}
            </span>
          </div>
          <span className="text-gray-400 text-sm">–</span>
          <div className="flex items-center gap-2">
            <span className="font-display text-3xl font-bold text-phillies-navy tabular-nums">
              {linescore.teams.home.runs ?? 0}
            </span>
            <img
              src={teamLogoUrl(feed.gameData.teams.home.id)}
              alt=""
              className="w-8 h-8"
              onError={hideOnError}
            />
          </div>
        </div>

        <div>
          <div className="font-display text-xs uppercase tracking-wider text-gray-400">
            Inning
          </div>
          <div className="font-display text-xl font-bold text-phillies-navy">
            {linescore.inningState} {linescore.currentInning}
          </div>
        </div>

        <div>
          <div className="font-display text-xs uppercase tracking-wider text-gray-400">
            Count
          </div>
          <div className="font-display text-xl font-bold text-phillies-navy tabular-nums">
            {linescore.balls ?? 0}-{linescore.strikes ?? 0} · {outs} {outs === 1 ? 'out' : 'outs'}
          </div>
        </div>

        {matchup && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <img
                src={playerHeadshotUrl(matchup.batter.id)}
                alt=""
                className="w-8 h-8 rounded-full"
                onError={hideOnError}
              />
              <div>
                <div className="font-display text-xs uppercase tracking-wider text-gray-400">
                  AB
                </div>
                <div className="text-sm text-phillies-navy font-medium">
                  {matchup.batter.fullName}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <img
                src={playerHeadshotUrl(matchup.pitcher.id)}
                alt=""
                className="w-8 h-8 rounded-full"
                onError={hideOnError}
              />
              <div>
                <div className="font-display text-xs uppercase tracking-wider text-gray-400">
                  P
                </div>
                <div className="text-sm text-phillies-navy font-medium">
                  {matchup.pitcher.fullName}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
