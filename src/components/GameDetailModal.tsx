import { useEffect, useMemo, useState } from 'react'
import { fetchBoxscore, teamLogoUrl } from '../api/mlb'
import type { BoxscorePlayer, BoxscoreTeam, GameBoxscore } from '../api/mlb'
import { formatDate } from '../utils/date'

const PHILLIES_ID = 143

interface Props {
  gamePk: number
  onClose: () => void
}

// The response carries the entire 26-man roster, with an empty stats object for
// anyone who never entered the game. This is the same trap that forced the chat
// bot's get_game_boxscore tool to exist — without it the modal would list every
// rostered player as though they had played.
function played(player: BoxscorePlayer, group: 'batting' | 'pitching'): boolean {
  return Object.keys(player.stats?.[group] ?? {}).length > 0
}

// Batting-order slot codes sort into a correct lineup as plain strings: 100,
// 101, 200, 300 … 900. A code not ending in "00" is a substitute in that slot.
function battingRows(team: BoxscoreTeam): { player: BoxscorePlayer; isSub: boolean }[] {
  return Object.values(team.players)
    .filter(p => played(p, 'batting'))
    .sort((a, b) => (a.battingOrder ?? '999').localeCompare(b.battingOrder ?? '999'))
    .map(player => ({
      player,
      isSub: player.battingOrder != null && !player.battingOrder.endsWith('00'),
    }))
}

// `pitchers` is appearance order and is safe to use directly. `batters` is NOT
// the batting order — it appends the pitchers to the end — which is why the
// batting side sorts by slot code instead.
function pitchingRows(team: BoxscoreTeam): BoxscorePlayer[] {
  return (team.pitchers ?? [])
    .map(id => team.players[`ID${id}`])
    .filter((p): p is BoxscorePlayer => p != null && played(p, 'pitching'))
}

function Th({ children, align = 'center' }: { children: React.ReactNode; align?: 'left' | 'center' }) {
  return (
    <th className={`${align === 'left' ? 'text-left' : 'text-center'} font-medium py-2 px-2`}>
      {children}
    </th>
  )
}

function TeamBoxscore({ team, label }: { team: BoxscoreTeam; label: string }) {
  const batters = battingRows(team)
  const pitchers = pitchingRows(team)

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <img
          src={teamLogoUrl(team.team.id)}
          alt=""
          className="w-5 h-5 shrink-0"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-phillies-navy">
          {label}
        </h3>
      </div>

      {batters.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-gray-500 text-xs uppercase">
                <Th align="left">Batting</Th>
                <Th>AB</Th><Th>R</Th><Th>H</Th><Th>RBI</Th><Th>BB</Th><Th>K</Th><Th>AVG</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batters.map(({ player, isSub }) => {
                const s = player.stats?.batting ?? {}
                return (
                  <tr key={player.person.id}>
                    <td className={`py-2 px-2 text-gray-900 ${isSub ? 'pl-6 text-gray-600' : ''}`}>
                      {player.person.fullName}
                      <span className="text-gray-400 ml-1.5 text-xs">
                        {player.position?.abbreviation}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center tabular-nums text-gray-700">{s.atBats ?? 0}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-gray-700">{s.runs ?? 0}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-gray-700">{s.hits ?? 0}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-gray-700">{s.rbi ?? 0}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-gray-700">{s.baseOnBalls ?? 0}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-gray-700">{s.strikeOuts ?? 0}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-gray-500">
                      {player.seasonStats?.batting?.avg ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pitchers.length > 0 && (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-gray-500 text-xs uppercase">
                <Th align="left">Pitching</Th>
                <Th>IP</Th><Th>H</Th><Th>R</Th><Th>ER</Th><Th>BB</Th><Th>K</Th><Th>ERA</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pitchers.map(player => {
                const s = player.stats?.pitching ?? {}
                return (
                  <tr key={player.person.id}>
                    <td className="py-2 px-2 text-gray-900">
                      {player.person.fullName}
                      {/* MLB pre-formats this as "(W, 2-8)" / "(S, 18)". */}
                      {s.note && <span className="text-gray-500 ml-1.5 text-xs">{s.note}</span>}
                    </td>
                    <td className="py-2 px-2 text-center tabular-nums text-gray-700">{s.inningsPitched ?? '0.0'}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-gray-700">{s.hits ?? 0}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-gray-700">{s.runs ?? 0}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-gray-700">{s.earnedRuns ?? 0}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-gray-700">{s.baseOnBalls ?? 0}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-gray-700">{s.strikeOuts ?? 0}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-gray-500">
                      {player.seasonStats?.pitching?.era ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LineScore({ feed }: { feed: GameBoxscore }) {
  const linescore = feed.liveData.linescore
  const innings = linescore?.innings ?? []
  if (innings.length === 0) return null

  const { home, away } = feed.gameData.teams
  const sides = [
    { key: 'away' as const, label: away.abbreviation ?? away.teamName ?? away.name },
    { key: 'home' as const, label: home.abbreviation ?? home.teamName ?? home.name },
  ]

  return (
    <div className="overflow-x-auto mb-4">
      <table className="text-sm whitespace-nowrap">
        <thead>
          <tr className="text-gray-500 text-xs uppercase">
            <th className="text-left font-medium py-1.5 pr-3" />
            {innings.map(inning => (
              <th key={inning.num} className="font-medium py-1.5 px-2 w-7 text-center">
                {inning.num}
              </th>
            ))}
            <th className="font-medium py-1.5 pl-3 pr-2 text-center border-l border-gray-200">R</th>
            <th className="font-medium py-1.5 px-2 text-center">H</th>
            <th className="font-medium py-1.5 px-2 text-center">E</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sides.map(side => (
            <tr key={side.key}>
              <td className="py-1.5 pr-3 font-display font-bold text-phillies-navy">{side.label}</td>
              {innings.map(inning => (
                <td key={inning.num} className="py-1.5 px-2 text-center tabular-nums text-gray-700">
                  {inning[side.key]?.runs ?? '-'}
                </td>
              ))}
              <td className="py-1.5 pl-3 pr-2 text-center tabular-nums font-semibold text-gray-900 border-l border-gray-200">
                {linescore?.teams?.[side.key]?.runs ?? 0}
              </td>
              <td className="py-1.5 px-2 text-center tabular-nums text-gray-700">
                {linescore?.teams?.[side.key]?.hits ?? 0}
              </td>
              <td className="py-1.5 px-2 text-center tabular-nums text-gray-700">
                {linescore?.teams?.[side.key]?.errors ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function GameDetailModal({ gamePk, onClose }: Props) {
  const [feed, setFeed] = useState<GameBoxscore | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchBoxscore(gamePk)
      .then(data => { if (!cancelled) setFeed(data) })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [gamePk])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Phillies section first regardless of home/away, matching the rest of the app.
  const ordered = useMemo(() => {
    if (feed == null) return []
    const boxscore = feed.liveData.boxscore?.teams
    if (boxscore == null) return []
    const philliesAreHome = feed.gameData.teams.home.id === PHILLIES_ID
    const sides = philliesAreHome
      ? [boxscore.home, boxscore.away]
      : [boxscore.away, boxscore.home]
    return sides.filter((t): t is BoxscoreTeam => t?.players != null)
  }, [feed])

  const header = useMemo(() => {
    if (feed == null) return null
    const { home, away } = feed.gameData.teams
    const linescore = feed.liveData.linescore
    const philliesAreHome = home.id === PHILLIES_ID
    const phillies = philliesAreHome ? home : away
    const opponent = philliesAreHome ? away : home
    const philliesRuns = linescore?.teams?.[philliesAreHome ? 'home' : 'away']?.runs
    const oppRuns = linescore?.teams?.[philliesAreHome ? 'away' : 'home']?.runs
    const date = feed.gameData.datetime?.officialDate
    return {
      // Falls back to the plain matchup before a linescore exists.
      title:
        philliesRuns == null || oppRuns == null
          ? `${phillies.teamName ?? phillies.name} vs ${opponent.teamName ?? opponent.name}`
          : `${phillies.teamName ?? phillies.name} ${philliesRuns}, ${opponent.teamName ?? opponent.name} ${oppRuns}`,
      subtitle: [
        date ? formatDate(date, { month: 'short', day: 'numeric' }) : null,
        feed.gameData.status.detailedState,
      ]
        .filter(Boolean)
        .join(' · '),
    }
  }, [feed])

  const decisions = feed?.liveData.decisions
  const decisionParts = [
    decisions?.winner && `W: ${decisions.winner.fullName}`,
    decisions?.loser && `L: ${decisions.loser.fullName}`,
    decisions?.save && `S: ${decisions.save.fullName}`,
  ].filter(Boolean) as string[]

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Game box score"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 truncate">
              {header?.title ?? 'Box score'}
            </h2>
            {header?.subtitle && (
              <div className="text-xs text-gray-500 mt-0.5">{header.subtitle}</div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close box score"
            className="text-gray-400 hover:text-gray-700 text-xl leading-none px-2 shrink-0"
          >
            &times;
          </button>
        </div>

        <div className="p-4">
          {loading && <div className="py-8 text-center text-gray-500">Loading box score…</div>}
          {/* Unlike the self-hiding cards, a modal the user deliberately opened
              should say something went wrong rather than render nothing. */}
          {error && <div className="py-8 text-center text-red-600">{error}</div>}
          {!loading && !error && feed && (
            <>
              <LineScore feed={feed} />
              {decisionParts.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mb-5 pb-4 border-b border-gray-100">
                  {decisionParts.map(part => (
                    <span key={part}>{part}</span>
                  ))}
                </div>
              )}
              {ordered.length > 0 ? (
                ordered.map(team => (
                  <TeamBoxscore key={team.team.id} team={team} label={team.team.name} />
                ))
              ) : (
                // Postponed, suspended, or otherwise never played: the feed
                // exists but liveData carries no players.
                <div className="py-8 text-center text-gray-500">
                  No box score available for this game.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
