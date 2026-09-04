import { useEffect, useMemo, useState } from 'react'
import { fetchBattingByDateRange } from '../api/mlb'
import type { BattingStats, HitterForm, Player, WindowBattingStats } from '../types/mlb'
import { easternToday, formatDate, shiftDate } from '../utils/date'
import { buildForms, formatDelta, MIN_PLATE_APPEARANCES, TREND_THRESHOLD } from '../utils/battingForm'
import { TableSkeleton } from './Feedback'

/** Calendar days in the form window, today inclusive. */
const WINDOW_DAYS = 15

interface Props {
  // Passed down from BattingTable, which already fetches this — the same
  // no-duplicate-fetch arrangement as BullpenUsage taking seasonSplits from
  // PitchingTable. It is usually still [] when this panel first renders (this
  // panel's single request often beats the table's), so the comparison is a
  // useMemo over the prop rather than something computed inside the network
  // effect: without that, every row would be stuck on "—" until a remount.
  seasonSplits: { player: Player; stat: BattingStats }[]
}

const GROUPS: { trend: HitterForm['trend']; label: string }[] = [
  { trend: 'hot', label: 'Heating up' },
  { trend: 'steady', label: 'Holding steady' },
  { trend: 'cold', label: 'Cooling off' },
  // Only reachable while the season line is still loading, or for a hitter who
  // has one in the window but none for the season — a call-up whose first game
  // is inside it. Labelled rather than hidden, so a row never silently vanishes.
  { trend: 'unknown', label: 'No season line yet' },
]

function FormRow({ form }: { form: HitterForm }) {
  const delta = formatDelta(form.opsDelta)
  return (
    <tr className="group hover:bg-gray-50">
      {/* Pinned while the row scrolls, same idiom as BullpenUsage and the stat
          tables: the delta sits in the last column, so reaching it on a phone
          would otherwise scroll the name out of view. Needs its own background
          — the rows beneath show through a transparent sticky cell. */}
      <td className="sticky left-0 bg-panel px-4 py-3 text-gray-900 transition-colors group-hover:bg-gray-50">
        {form.name}
      </td>
      <td className="px-3 py-3 text-center tabular-nums">{form.games}</td>
      <td className="px-3 py-3 text-center tabular-nums">{form.atBats}</td>
      <td className="px-3 py-3 text-center tabular-nums">{form.hits}</td>
      <td className="px-3 py-3 text-center tabular-nums">{form.homeRuns}</td>
      <td className="px-3 py-3 text-center tabular-nums">{form.rbi}</td>
      <td className="px-3 py-3 text-center tabular-nums">{form.avg}</td>
      <td className="px-3 py-3 text-center font-semibold text-gray-900 tabular-nums">{form.ops}</td>
      <td className="px-3 py-3 text-center tabular-nums text-gray-600">
        {delta === null ? <span className="text-gray-400">—</span> : delta}
      </td>
    </tr>
  )
}

function GroupHeader({ label }: { label: string }) {
  return (
    <tr className="bg-gray-50">
      <td colSpan={9} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
        {/* Spans every column so the label itself is pinned — otherwise it
            scrolls out from under the sticky Batter column mid-word. */}
        <span className="sticky left-0 inline-block">{label}</span>
      </td>
    </tr>
  )
}

/**
 * Trailing-window batting form: who is swinging it well right now, measured
 * against each hitter's own season line.
 *
 * The Batting tab showed season totals and nothing else, and a season average
 * is exactly the statistic that cannot answer "is he going well at the moment" —
 * by August it takes weeks of hits to move. This is the hitting counterpart to
 * BullpenUsage on the Pitching tab, and it holds itself to the same standard:
 * it reports the window and the gap to the baseline, and predicts nothing.
 */
export default function BattingForm({ seasonSplits }: Props) {
  const [loading, setLoading] = useState(true)
  // null = the request failed, so the panel self-hides (HeroStrip /
  // BullpenUsage convention). [] with loading done = it succeeded and nobody
  // cleared the sample gate, which self-hides too.
  const [windowSplits, setWindowSplits] = useState<{ player: Player; stat: WindowBattingStats }[] | null>(null)
  const [range, setRange] = useState<{ start: string; end: string } | null>(null)

  useEffect(() => {
    let cancelled = false

    const end = easternToday()
    const start = shiftDate(end, -(WINDOW_DAYS - 1))
    setRange({ start, end })

    fetchBattingByDateRange(start, end)
      .then(splits => {
        if (!cancelled) setWindowSplits(splits)
      })
      .catch(() => {
        if (!cancelled) setWindowSplits(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Recomputed for free when seasonSplits fills in — see the Props note.
  const forms = useMemo(
    () => (windowSplits === null ? null : buildForms(windowSplits, seasonSplits)),
    [windowSplits, seasonSplits]
  )

  if (loading) return <TableSkeleton rows={6} cols={9} />
  // Self-hides on a failed request, and on an empty window: in the off-season,
  // or after the All-Star break, a table of hitters with no plate appearances
  // would be a header over nothing.
  if (forms === null || forms.length === 0) return null

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">Hot &amp; Cold</h2>
      {/* Card chrome lives out here so the border wraps the scroll area rather
          than the table's min-content width — same fix as BullpenUsage. */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
              <th scope="col" className="sticky left-0 bg-gray-50 px-4 py-3 text-left font-medium">Batter</th>
              <th scope="col" className="px-3 py-3 text-center font-medium">G</th>
              <th scope="col" className="px-3 py-3 text-center font-medium">AB</th>
              <th scope="col" className="px-3 py-3 text-center font-medium">H</th>
              <th scope="col" className="px-3 py-3 text-center font-medium">HR</th>
              <th scope="col" className="px-3 py-3 text-center font-medium">RBI</th>
              <th scope="col" className="px-3 py-3 text-center font-medium">AVG</th>
              <th scope="col" className="px-3 py-3 text-center font-medium">OPS</th>
              {/* Abbreviated in the header, spelled out in the footnote: the
                  column is the whole point of the panel and "vs Season OPS"
                  wraps to three lines on a phone. */}
              <th scope="col" className="px-3 py-3 text-center font-medium whitespace-nowrap">±OPS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* flatMap rather than a fragment per group: a group with no rows
                has to contribute nothing at all, and an empty fragment would
                still leave its header behind. */}
            {GROUPS.flatMap(({ trend, label }) => {
              const rows = forms.filter(f => f.trend === trend)
              if (rows.length === 0) return []
              return [
                <GroupHeader key={`header-${trend}`} label={label} />,
                ...rows.map(f => <FormRow key={f.playerId} form={f} />),
              ]
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {range && (
          <>
            Last {WINDOW_DAYS} days ({formatDate(range.start, { month: 'short', day: 'numeric' })} –{' '}
            {formatDate(range.end, { month: 'short', day: 'numeric' })}),{' '}
          </>
        )}
        minimum {MIN_PLATE_APPEARANCES} plate appearances. ±OPS is this stretch against the same
        hitter&rsquo;s season OPS; a gap of {TREND_THRESHOLD.toFixed(3).replace(/^0/, '')} either way
        groups the row. A description of what has happened, not a forecast.
      </p>
    </div>
  )
}
