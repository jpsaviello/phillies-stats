import { useEffect, useMemo, useState } from 'react'
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
import type { BattingStats, PitchingStats, Player, StandingsRecord } from '../types/mlb'
import { getPhilliesOdds } from '../utils/odds'
import { easternToday, formatDate, shiftDate } from '../utils/date'
import { inningsToFloat } from '../utils/innings'

const PHILLIES_ID = 143

// States before first pitch — anything else shows its live detailedState
// instead of the scheduled time.
const PREGAME_STATES = ['Scheduled', 'Pre-Game', 'Warmup']

/**
 * Per-card load state.
 *
 * The strip used to run one Promise.all over standings, schedule, batting,
 * pitching and odds, and hide ITSELF if any of them rejected — so a flaky
 * season-stats call took the record and the next game down with it, on every
 * tab, even though those cards had their data in hand. The three fetch chains
 * below are independent and each card reports its own state: one failure costs
 * one card.
 */
type Status = 'loading' | 'ready' | 'failed'

interface Props {
  /**
   * 'season' drops the Last Game and Next Game cards.
   *
   * Used on the Today tab, where both are pure duplication: that tab leads with
   * the live-or-next game in full and recaps the last one below it, so the
   * strip would state the same two facts a few hundred pixels above in smaller
   * type. On every other tab the strip is the only game context there is, so it
   * keeps all four. Halves the strip's height on a phone, where the 2x2 grid is
   * the tallest thing above the tab bar.
   */
  variant?: 'full' | 'season'
}

interface Leader {
  player: Player
  value: string
}

interface ScheduledGame {
  game: Game
  date: string
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

/**
 * One summary card. Owns the loading and failed presentations so every card
 * fails the same way — a dash, not an error, since the strip only summarizes
 * data the tabs already expose in full.
 */
function Card({ label, status, children }: { label: string; status: Status; children: React.ReactNode }) {
  return (
    <div className="bg-panel border border-rule -ml-px -mt-px px-3 py-2 sm:px-4 sm:py-3">
      <div className="card-label">{label}</div>
      {status === 'loading' ? (
        <div className="h-7 sm:h-8 mt-1.5 sm:mt-2 bg-gray-200 animate-pulse" />
      ) : status === 'failed' ? (
        <div className="font-display text-xl font-bold text-gray-400 mt-1">—</div>
      ) : (
        children
      )}
    </div>
  )
}

export default function HeroStrip({ variant = 'full' }: Props) {
  const [record, setRecord] = useState<StandingsRecord | null>(null)
  const [recordStatus, setRecordStatus] = useState<Status>('loading')

  const [games, setGames] = useState<ScheduledGame[]>([])
  const [odds, setOdds] = useState<OddsGame[]>([])
  const [scheduleStatus, setScheduleStatus] = useState<Status>('loading')

  const [batting, setBatting] = useState<{ player: Player; stat: BattingStats }[]>([])
  const [pitching, setPitching] = useState<{ player: Player; stat: PitchingStats }[]>([])
  const [statsStatus, setStatsStatus] = useState<Status>('loading')

  // The BASEBALL day, not the visitor's. Every date MLB returns is an Eastern
  // calendar date, so a fan west of ET watching a night game is already on
  // tomorrow's local date and would be given a window shifted a day off the
  // schedule they're reading.
  const today = easternToday()

  useEffect(() => {
    fetchStandings()
      .then(standings => {
        const own = standings.find(r => r.team.id === PHILLIES_ID)
        setRecord(own ?? null)
        setRecordStatus(own ? 'ready' : 'failed')
      })
      .catch(() => setRecordStatus('failed'))
  }, [])

  const showGames = variant === 'full'

  useEffect(() => {
    // Nothing on screen needs the schedule in the season variant, so it isn't
    // fetched. Switching to another tab flips `variant` and this runs then.
    if (!showGames) return
    // Odds already fail soft into an empty list — they decorate the Next Game
    // card and must never be able to take the game itself down.
    Promise.all([
      fetchSchedule(shiftDate(today, -10), shiftDate(today, 7)),
      fetchOdds().catch(() => [] as OddsGame[]),
    ])
      .then(([dates, oddsData]) => {
        setGames(dates.flatMap(d => d.games.map(game => ({ game, date: d.date }))))
        setOdds(oddsData)
        setScheduleStatus('ready')
      })
      .catch(() => setScheduleStatus('failed'))
  }, [today, showGames])

  useEffect(() => {
    Promise.all([fetchBattingStats(), fetchPitchingStats()])
      .then(([battingData, pitchingData]) => {
        setBatting(battingData)
        setPitching(pitchingData)
        setStatsStatus('ready')
      })
      .catch(() => setStatsStatus('failed'))
  }, [])

  const lastGame = useMemo(() => {
    const finals = games.filter(g => g.game.status.detailedState === 'Final')
    return finals[finals.length - 1] ?? null
  }, [games])

  const nextGame = useMemo(() => {
    // Prefer today-or-later so a stale Postponed/Suspended game from the 10-day
    // lookback can't monopolize the card.
    const nonFinal = games.filter(g => g.game.status.detailedState !== 'Final')
    return nonFinal.find(g => g.date >= today) ?? nonFinal[0] ?? null
  }, [games, today])

  // Odds only for a today game, same policy as the Schedule tab.
  const nextOdds = useMemo(() => {
    if (!nextGame || nextGame.date !== today) return null
    const key = ['Philadelphia Phillies', gameView(nextGame.game).opponent].sort().join('|')
    const oddsGame = odds.find(o => [o.home_team, o.away_team].sort().join('|') === key)
    return oddsGame ? getPhilliesOdds(oddsGame) : null
  }, [nextGame, odds, today])

  /**
   * Recomputed when the record lands rather than being derived once inside the
   * stats fetch, so the two chains stay genuinely independent: leaders render
   * from whatever has arrived, and the qualification thresholds simply tighten
   * once the team's games-played count is known. With no record the thresholds
   * floor at 1, which is the same "any batter with an at-bat" pool the season's
   * opening days already fall back to.
   */
  const leaders = useMemo<{ label: string; leader: Leader | null }[]>(() => {
    // With no standings, the closest honest proxy for team games played is the
    // most games any one hitter has appeared in — a lower bound, and within a
    // handful of the real figure for any everyday player. Falling back to zero
    // instead would floor both thresholds at 1 and collapse the qualification
    // gate entirely, which in September promotes a call-up's 4-for-11 to team
    // batting leader. That pool is the right one on opening weekend and badly
    // wrong in month five, and standings being down says nothing about which.
    const teamGames = record
      ? record.wins + record.losses
      : batting.reduce((most, s) => Math.max(most, s.stat.gamesPlayed ?? 0), 0)

    // Approximates the official 3.1 PA/game qualification rule.
    const qualified = batting.filter(s => s.stat.atBats >= Math.max(1, 2 * teamGames))
    const avgPool = qualified.length ? qualified : batting.filter(s => s.stat.atBats >= 1)
    const avgLeader = maxBy(avgPool, s => parseFloat(s.stat.avg))
    const hrLeader = maxBy(batting, s => s.stat.homeRuns)
    const eraLeader = maxBy(
      // Innings go through inningsToFloat: "6.1" is six and a third, and
      // parseFloat reads it as 6.1 — close enough to pass a threshold most of
      // the time, which is exactly what makes it a bad habit to leave lying
      // around next to the module that exists to prevent it.
      pitching.filter(s => inningsToFloat(s.stat.inningsPitched) >= Math.max(1, teamGames)),
      s => -parseFloat(s.stat.era)
    )

    return [
      { label: 'AVG', leader: avgLeader && { player: avgLeader.player, value: avgLeader.stat.avg } },
      { label: 'HR', leader: hrLeader && { player: hrLeader.player, value: `${hrLeader.stat.homeRuns}` } },
      { label: 'ERA', leader: eraLeader && { player: eraLeader.player, value: eraLeader.stat.era } },
    ]
  }, [batting, pitching, record])

  // Only when there is nothing at all to say does the strip disappear, which is
  // the behavior it always had for a total outage. A single failed chain now
  // costs its own cards and nothing else.
  const scheduleDown = !showGames || scheduleStatus === 'failed'
  if (recordStatus === 'failed' && scheduleDown && statsStatus === 'failed') return null

  const last = lastGame && gameView(lastGame.game)
  const next = nextGame && gameView(nextGame.game)
  const nextDate = nextGame && new Date(nextGame.game.gameDate)
  const nextIsLive = nextGame && !PREGAME_STATES.includes(nextGame.game.status.detailedState)

  return (
    <div className="max-w-7xl mx-auto px-4 py-2 sm:py-3">
      {/* The season variant keeps the strip's full width and splits it between
          two cards rather than capping itself narrow. Every other module above
          the nav — the banners, Today in Phils, the nav itself — is this wide,
          and a strip that stopped halfway was the one thing on the page that
          didn't line up with anything. */}
      <div className={`grid grid-cols-2 ${showGames ? 'lg:grid-cols-4' : ''}`}>
        {/* recordStatus is already 'failed' when the response carried no
            Phillies row, so there is nothing extra to check here. */}
        <Card label="Record" status={recordStatus}>
          {record && (
            <>
              <div className="font-display text-2xl sm:text-3xl font-bold text-mark tabular-nums mt-0.5 sm:mt-1">
                {record.wins}–{record.losses}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">
                {record.gamesBack === '-'
                  ? `${ordinal(record.divisionRank)} NL East`
                  : `${ordinal(record.divisionRank)} NL East · ${record.gamesBack} GB`}
              </div>
            </>
          )}
        </Card>

        {showGames && (
        <Card label="Last Game" status={scheduleStatus === 'ready' && !lastGame ? 'failed' : scheduleStatus}>
          {lastGame && last && (
            <>
              <div className="font-display text-lg sm:text-xl font-bold text-mark tabular-nums mt-0.5 sm:mt-1">
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
                {formatDate(lastGame.date, { month: 'short', day: 'numeric' })}
              </div>
            </>
          )}
        </Card>
        )}

        {showGames && (
        <Card label="Next Game" status={scheduleStatus === 'ready' && !nextGame ? 'failed' : scheduleStatus}>
          {nextGame && next && nextDate && (
            <>
              <div className="flex items-center gap-1.5 mt-1 min-w-0">
                <img
                  src={teamLogoUrl(next.opponentId)}
                  alt={next.opponent}
                  className="w-6 h-6 shrink-0"
                  onError={hideOnError}
                />
                <span className="font-display text-lg sm:text-xl font-bold text-mark truncate">
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
          )}
        </Card>
        )}

        <Card label="Team Leaders" status={statsStatus}>
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
                    <span className="card-label w-8 shrink-0">{label}</span>
                    <span className="font-display font-bold text-mark tabular-nums">{leader.value}</span>
                    <span className="text-sm text-gray-600 truncate">{lastName(leader.player)}</span>
                  </>
                ) : (
                  <>
                    <span className="card-label w-8 shrink-0">{label}</span>
                    <span className="text-gray-400">—</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
