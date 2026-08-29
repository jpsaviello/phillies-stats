import { useEffect, useState } from 'react'
import {
  fetchGameLog,
  fetchPitcherSeason,
  formatOdds,
  playerHeadshotUrl,
  teamLogoUrl,
} from '../api/mlb'
import type { Game } from '../api/mlb'
import type { PitchingStats, ProbablePitcher, RecentForm } from '../types/mlb'
import type { getPhilliesOdds } from '../utils/odds'
import { handLabel, recentForm } from '../utils/matchup'

const PHILLIES_ID = 143
const RECENT_STARTS = 3

// Every stat cell is styled identically. An earlier version emphasized whichever
// pitcher had the better ERA, which was a mistake twice over: it was drawn in
// phillies-red, the club's own brand color, so the *opponent* lit up in Phillies
// red whenever he was outpitching us — and picking a winner per row editorializes
// on a panel whose job is to lay the two lines side by side and let you read them.
const CELL = 'py-1 text-center font-display tabular-nums text-phillies-navy'

interface Props {
  game: Game
  date: string
  philliesOdds: ReturnType<typeof getPhilliesOdds>
}

interface Starter {
  pitcher: ProbablePitcher
  teamId: number
  teamName: string
  /** MLB pitchHand.code ("L" / "R" / "S"); null when MLB has none on file. */
  hand: string | null
  season: PitchingStats | null
  form: RecentForm | null
}

function hideOnError(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = 'none'
}

// One starter's two lookups. Season line (which also carries the throwing hand)
// and game log are awaited together but the whole pair degrades to nulls on
// failure, so a dead upstream for one pitcher still leaves the other side of the
// matchup rendered.
async function loadStarter(
  pitcher: ProbablePitcher,
  teamId: number,
  teamName: string
): Promise<Starter> {
  const [meta, log] = await Promise.all([
    fetchPitcherSeason(pitcher.id).catch(() => ({ hand: null, season: null })),
    fetchGameLog(pitcher.id, 'pitching').catch(() => []),
  ])
  return {
    pitcher,
    teamId,
    teamName,
    hand: meta.hand,
    season: meta.season,
    form: recentForm(log, RECENT_STARTS),
  }
}

function StarterHead({ starter }: { starter: Starter | null }) {
  if (!starter) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="w-10 h-10 rounded-full bg-gray-100" />
        <div className="font-display text-sm font-bold text-gray-400">TBA</div>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <div className="relative">
        <img
          src={playerHeadshotUrl(starter.pitcher.id)}
          alt=""
          className="w-10 h-10 rounded-full bg-gray-100 object-cover"
          onError={hideOnError}
        />
        <img
          src={teamLogoUrl(starter.teamId)}
          alt=""
          className="absolute -bottom-1 -right-1 w-4 h-4"
          onError={hideOnError}
        />
      </div>
      <div className="font-display text-sm font-bold text-phillies-navy text-center leading-tight">
        {starter.pitcher.fullName}
      </div>
      <div className="text-[11px] text-gray-500 truncate leading-tight">{starter.teamName}</div>
      {handLabel(starter.hand) && (
        <div className="text-[11px] font-semibold text-gray-600 leading-tight">
          {handLabel(starter.hand)}
        </div>
      )}
    </div>
  )
}

export default function MatchupPreview({ game, date, philliesOdds }: Props) {
  const [starters, setStarters] = useState<{ phi: Starter | null; opp: Starter | null } | null>(null)
  const [loading, setLoading] = useState(true)

  const isHome = game.teams.home.team.id === PHILLIES_ID
  const us = isHome ? game.teams.home : game.teams.away
  const them = isHome ? game.teams.away : game.teams.home
  const phiProbable = us.probablePitcher
  const oppProbable = them.probablePitcher

  // Depends on the whole game rather than the probables picked out above:
  // `game` comes straight from Schedule's state, so it's referentially stable
  // between renders and only changes when the schedule is refetched — at which
  // point the probables genuinely may have changed and this should re-run.
  useEffect(() => {
    const home = game.teams.home.team.id === PHILLIES_ID
    const mine = home ? game.teams.home : game.teams.away
    const theirs = home ? game.teams.away : game.teams.home

    let cancelled = false
    setLoading(true)
    Promise.all([
      mine.probablePitcher ? loadStarter(mine.probablePitcher, mine.team.id, 'Phillies') : null,
      theirs.probablePitcher
        ? loadStarter(theirs.probablePitcher, theirs.team.id, theirs.team.name)
        : null,
    ])
      .then(([phi, opp]) => {
        if (!cancelled) setStarters({ phi, opp })
      })
      // loadStarter already swallows its own failures, so this only fires on
      // something unexpected — self-hide rather than show a broken panel.
      .catch(() => {
        if (!cancelled) setStarters(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [game])

  // MLB posts probables about two days out. With neither announced this panel
  // would say "TBA vs TBA" over an empty stat table, which is strictly less
  // than the Next Game card in HeroStrip already shows — so it stays hidden.
  if (!phiProbable && !oppProbable) return null

  if (loading) {
    return (
      // Height matches the rendered panel so the schedule list below it doesn't
      // jump once the pitcher lookups resolve.
      <div className="card px-4 py-3 mb-4 max-w-2xl" role="status">
        <span className="sr-only">Loading matchup…</span>
        <div className="h-[280px] rounded-lg bg-gray-100 animate-pulse" aria-hidden="true" />
      </div>
    )
  }
  if (!starters) return null

  const { phi, opp } = starters
  const gameDate = new Date(game.gameDate)
  const when = `${gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`

  const rows: { label: string; left: string; right: string }[] = [
    {
      label: 'ERA',
      left: phi?.season?.era ?? '—',
      right: opp?.season?.era ?? '—',
    },
    {
      label: 'W–L',
      left: phi?.season ? `${phi.season.wins}–${phi.season.losses}` : '—',
      right: opp?.season ? `${opp.season.wins}–${opp.season.losses}` : '—',
    },
    { label: 'IP', left: phi?.season?.inningsPitched ?? '—', right: opp?.season?.inningsPitched ?? '—' },
    {
      label: 'K',
      left: phi?.season ? String(phi.season.strikeOuts) : '—',
      right: opp?.season ? String(opp.season.strikeOuts) : '—',
    },
    { label: 'WHIP', left: phi?.season?.whip ?? '—', right: opp?.season?.whip ?? '—' },
    {
      label: `Last ${RECENT_STARTS}`,
      left: phi?.form ? `${phi.form.era} · ${phi.form.inningsPitched} IP` : '—',
      right: opp?.form ? `${opp.form.era} · ${opp.form.inningsPitched} IP` : '—',
    },
  ]

  return (
    <div className="card px-4 py-3 mb-4 max-w-2xl">
      {/* Wraps rather than truncates: at 375px a long club name ("Arizona
          Diamondbacks") plus the date overruns the row, and clipping the
          opponent is worse than spending a second line on it. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="card-label">Next Up</span>
        <span className="text-xs text-gray-500">
          {isHome ? 'vs' : '@'} {them.team.name} · {when}
        </span>
      </div>

      <table className="w-full mt-2">
        <caption className="sr-only">
          Probable starting pitchers for the next Phillies game on {date}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-2/5 pb-2 font-normal">
              <StarterHead starter={phi} />
            </th>
            <th scope="col" className="w-1/5">
              <span className="sr-only">Statistic</span>
            </th>
            <th scope="col" className="w-2/5 pb-2 font-normal">
              <StarterHead starter={opp} />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(({ label, left, right }) => (
            <tr key={label}>
              <td className={CELL}>{left}</td>
              <th scope="row" className="py-1 card-label text-center font-normal whitespace-nowrap">
                {label}
              </th>
              <td className={CELL}>{right}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {philliesOdds && (
        <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-500 text-center">
          PHI ML {formatOdds(philliesOdds.ml)}
          {'  |  '}RL {philliesOdds.rlPoint > 0 ? '+' : ''}
          {philliesOdds.rlPoint} ({formatOdds(philliesOdds.rlJuice)})
        </div>
      )}
    </div>
  )
}
