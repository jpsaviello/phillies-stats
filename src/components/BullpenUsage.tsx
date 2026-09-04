import { useEffect, useMemo, useState } from 'react'
import { fetchBullpenBoxscore, fetchRoster, fetchSchedule } from '../api/mlb'
import type { PitchingStats, Player, PitcherWorkload, RosterEntry } from '../types/mlb'
import { easternToday, shiftDate } from '../utils/date'
import { buildWorkloads, extractTeamPitchers, sortByRecency, type RawAppearance } from '../utils/bullpen'
import { outsToInnings } from '../utils/innings'
import { TableSkeleton } from './Feedback'

const PHILLIES_ID = 143
const WINDOW_DAYS = 7

interface Props {
  // Passed down from PitchingTable, which already fetches this — see the
  // bullpen-usage design spec decision 3 for why this panel takes it as a prop
  // instead of fetching season stats a second time. Often still [] on this
  // panel's first render (PitchingTable's own fetch hasn't resolved yet), which
  // is why classification below is a useMemo over the prop rather than baked
  // into the one-time network effect — it has to react when this fills in.
  seasonSplits: { player: Player; stat: PitchingStats }[]
}

function OutingTrail({ workload }: { workload: PitcherWorkload }) {
  if (workload.outings.length === 0) return <span className="text-gray-400">—</span>
  return (
    <span className="text-xs text-gray-500 tabular-nums">
      {workload.outings
        .map(o => `${new Date(`${o.date}T12:00:00`).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })} (${o.pitches}p)`)
        .join(' · ')}
    </span>
  )
}

function WorkloadRow({ workload }: { workload: PitcherWorkload }) {
  return (
    <tr className="group hover:bg-gray-50">
      {/* Pinned while the row scrolls, same idiom as the Batting/Pitching
          tables' Player column: the flags sit in the last column, so reaching
          them on a phone otherwise scrolls the name out of view. Needs its own
          background (a sticky cell would show the rows beneath it through a
          transparent one) plus group-hover to keep the row highlight. */}
      <td className="sticky left-0 bg-panel px-4 py-3 text-gray-900 transition-colors group-hover:bg-gray-50">
        {workload.name}
      </td>
      <td className="px-4 py-3 text-center tabular-nums">
        {workload.daysSinceLast === null ? <span className="text-gray-400">—</span> : workload.daysSinceLast}
      </td>
      <td className="px-4 py-3 text-center tabular-nums">{workload.outings.length}</td>
      <td className="px-4 py-3 text-center tabular-nums">{workload.totalPitches || '—'}</td>
      <td className="px-4 py-3 text-center tabular-nums">{outsToInnings(workload.totalOuts)}</td>
      <td className="hidden sm:table-cell px-4 py-3">
        <OutingTrail workload={workload} />
      </td>
      <td className="px-4 py-3">
        {workload.flags.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {workload.flags.map(f => (
              <span
                key={f}
                className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 whitespace-nowrap"
              >
                {f}
              </span>
            ))}
          </span>
        )}
      </td>
    </tr>
  )
}

function GroupHeader({ label }: { label: string }) {
  return (
    <tr className="bg-gray-50">
      <td colSpan={7} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
        {/* Spans every column, so the label itself is pinned rather than the
            cell — without this it scrolls out from under the sticky Pitcher
            column and reads as a truncated word. */}
        <span className="sticky left-0 inline-block">{label}</span>
      </td>
    </tr>
  )
}

export default function BullpenUsage({ seasonSplits }: Props) {
  const [loading, setLoading] = useState(true)
  // null = schedule fetch failed outright (self-hide, per HeroStrip/WildCardStandings
  // convention). [] with the effect done = fetch succeeded but no games in window.
  const [appearances, setAppearances] = useState<RawAppearance[] | null>(null)
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [partial, setPartial] = useState(false)
  const [today, setToday] = useState('')
  const [windowStart, setWindowStart] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const todayET = easternToday()
      const start = shiftDate(todayET, -(WINDOW_DAYS - 1))
      setToday(todayET)
      setWindowStart(start)

      let scheduleGames: { gamePk: number; date: string }[]
      try {
        const dates = await fetchSchedule(start, todayET)
        scheduleGames = dates.flatMap(d =>
          d.games
            .filter(g => g.status.abstractGameState === 'Final')
            .map(g => ({ gamePk: g.gamePk, date: d.date }))
        )
      } catch {
        if (!cancelled) {
          setAppearances(null)
          setLoading(false)
        }
        return
      }

      if (scheduleGames.length === 0) {
        if (!cancelled) {
          setAppearances([])
          setLoading(false)
        }
        return
      }

      const [boxscoreResults, rosterResult] = await Promise.all([
        Promise.allSettled(scheduleGames.map(g => fetchBullpenBoxscore(g.gamePk))),
        fetchRoster().catch((): RosterEntry[] => []),
      ])

      let anyFailed = false
      const collected = boxscoreResults.flatMap((result, i) => {
        if (result.status === 'rejected') {
          anyFailed = true
          return []
        }
        return extractTeamPitchers(result.value, PHILLIES_ID, scheduleGames[i].gamePk, scheduleGames[i].date)
      })

      if (cancelled) return
      setPartial(anyFailed)
      setRoster(rosterResult)
      setAppearances(collected)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Recomputed whenever seasonSplits fills in — no refetch, just reclassification
  // (see Props comment). buildWorkloads itself is pure and cheap.
  const workloads = useMemo<PitcherWorkload[] | null>(() => {
    if (appearances === null) return null
    return buildWorkloads(appearances, roster, seasonSplits, today || easternToday())
  }, [appearances, roster, seasonSplits, today])

  if (loading) return <TableSkeleton rows={8} cols={6} />
  // Self-hides: schedule fetch failed, or no games in the window (off-season,
  // All-Star break) — a page of "not used in 7 days" rows for the whole staff
  // would be noise, not signal. Same convention as HeroStrip / MatchupPreview.
  if (workloads === null || workloads.length === 0) return null

  const bullpen = sortByRecency(workloads.filter(w => w.role === 'reliever'))
  const rotation = sortByRecency(workloads.filter(w => w.role === 'starter'))

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">Bullpen Usage</h2>
      {/* Scroll wrapper, matching the Batting/Pitching/Roster tables. The flag
          badges are whitespace-nowrap, so this table's min-content width is
          wider than a phone viewport; bare, it had nothing to scroll inside and
          stretched the whole document instead, leaving every other section
          narrower than the page and the rows running off to the right. The card
          chrome moves out here so the border still wraps the scroll area. */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
              <th scope="col" className="sticky left-0 bg-gray-50 px-4 py-3 text-left font-medium">Pitcher</th>
              <th scope="col" className="px-4 py-3 text-center font-medium">Rest</th>
              <th scope="col" className="px-4 py-3 text-center font-medium">App</th>
              <th scope="col" className="px-4 py-3 text-center font-medium">Pit</th>
              <th scope="col" className="px-4 py-3 text-center font-medium">IP</th>
              <th scope="col" className="hidden sm:table-cell px-4 py-3 text-left font-medium">Recent</th>
              <th scope="col" className="px-4 py-3 text-left font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bullpen.length > 0 && (
              <>
                <GroupHeader label="Bullpen" />
                {bullpen.map(w => (
                  <WorkloadRow key={w.playerId} workload={w} />
                ))}
              </>
            )}
            {rotation.length > 0 && (
              <>
                <GroupHeader label="Rotation" />
                {rotation.map(w => (
                  <WorkloadRow key={w.playerId} workload={w} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Appearances {windowStart && today ? `${windowStart} – ${today}` : 'this week'}. Rest is days
        since last appearance — not an availability prediction.
        {partial && ' Some games in this window failed to load, so counts may be incomplete.'}
      </p>
    </div>
  )
}
