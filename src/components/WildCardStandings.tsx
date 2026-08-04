import { Fragment, useEffect, useState } from 'react'
import { fetchWildCardStandings } from '../api/mlb'
import type { WildCardRecord } from '../types/mlb'

const PHILLIES_ID = 143
// The NL sends its top 3 wild card teams to the postseason (2022 format).
const PLAYOFF_SPOTS = 3
const MIN_ROWS_SHOWN = 7

export default function WildCardStandings() {
  const [records, setRecords] = useState<WildCardRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchWildCardStandings()
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [])

  // Secondary widget on someone else's tab: render nothing rather than a
  // skeleton or an error banner (same convention as HeroStrip/DailyBriefing).
  if (loading || !records.length) return null

  // The Phillies are absent from this response entirely whenever they lead the
  // NL East (the endpoint excludes division leaders), so philliesIndex may be -1.
  const philliesIndex = records.findIndex(r => r.team.id === PHILLIES_ID)
  const rowCount = philliesIndex >= 0 ? Math.max(MIN_ROWS_SHOWN, philliesIndex + 1) : MIN_ROWS_SHOWN
  const visible = records.slice(0, rowCount)

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-3">NL Wild Card Race</h2>
      <table className="w-full text-sm bg-white rounded-lg border border-gray-100 overflow-hidden">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
            <th className="px-4 py-3 text-left font-medium w-8">#</th>
            <th className="px-4 py-3 text-left font-medium">Team</th>
            <th className="px-4 py-3 text-center font-medium">W</th>
            <th className="px-4 py-3 text-center font-medium">L</th>
            <th className="px-4 py-3 text-center font-medium">GB</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visible.map((r, i) => {
            const isPhillies = r.team.id === PHILLIES_ID
            return (
              <Fragment key={r.team.id}>
                <tr className={isPhillies ? 'bg-red-50 font-semibold' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-3 text-gray-500 tabular-nums">{r.wildCardRank}</td>
                  <td className="px-4 py-3 text-gray-900 flex items-center gap-2">
                    {isPhillies && <span className="w-1.5 h-1.5 rounded-full bg-phillies-red inline-block" />}
                    {r.team.name}
                    {r.clinchIndicator && (
                      <span className="text-xs font-normal text-green-600 uppercase" title="Clinched">
                        {r.clinchIndicator}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">{r.wins}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{r.losses}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{r.wildCardGamesBack}</td>
                </tr>
                {i === PLAYOFF_SPOTS - 1 && i < visible.length - 1 && (
                  <tr className="bg-gray-50">
                    <td
                      colSpan={5}
                      className="px-4 py-1 text-[10px] font-medium uppercase tracking-wide text-gray-400 border-t-2 border-dashed border-gray-300"
                    >
                      Playoff cutoff
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
