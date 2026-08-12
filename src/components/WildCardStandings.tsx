import { Fragment, useEffect, useState } from 'react'
import { fetchSeasonResults, fetchWildCardStandings } from '../api/mlb'
import type { SeasonGameResult, WildCardRecord } from '../types/mlb'
import { applyTiebreakers, teamsNeedingTiebreak, type TiebreakerNote } from '../utils/tiebreakers'

const PHILLIES_ID = 143
const NL_LEAGUE_ID = 104
// The NL sends its top 3 wild card teams to the postseason (2022 format).
const PLAYOFF_SPOTS = 3
const MIN_ROWS_SHOWN = 7

// The Phillies are absent from this response entirely whenever they lead the
// NL East (the endpoint excludes division leaders), so philliesIndex may be -1.
function windowSize(records: WildCardRecord[]) {
  const philliesIndex = records.findIndex(r => r.team.id === PHILLIES_ID)
  return philliesIndex >= 0 ? Math.max(MIN_ROWS_SHOWN, philliesIndex + 1) : MIN_ROWS_SHOWN
}

export default function WildCardStandings() {
  const [records, setRecords] = useState<WildCardRecord[]>([])
  const [notes, setNotes] = useState<Map<number, TiebreakerNote>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Ties are resolved BEFORE first paint. The table already renders null while
    // loading, so the extra round trip costs a slightly later paint but avoids
    // visibly rearranging the playoff cutoff in front of the user.
    async function load() {
      const wildCard = await fetchWildCardStandings()
      const ids = teamsNeedingTiebreak(wildCard, windowSize(wildCard))
      if (!ids.length) return { ordered: wildCard, notes: new Map<number, TiebreakerNote>() }

      const settled = await Promise.allSettled(ids.map(fetchSeasonResults))
      const results = new Map<number, SeasonGameResult[]>()
      settled.forEach((s, i) => {
        if (s.status === 'fulfilled') results.set(ids[i], s.value)
      })
      // Partial data would order a tie against an incomplete head-to-head picture,
      // which is worse than not reordering at all.
      if (results.size < ids.length) return { ordered: wildCard, notes: new Map<number, TiebreakerNote>() }

      return applyTiebreakers(wildCard, results, NL_LEAGUE_ID)
    }

    load()
      .then(({ ordered, notes }) => {
        setRecords(ordered)
        setNotes(notes)
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [])

  // Secondary widget on someone else's tab: render nothing rather than a
  // skeleton or an error banner (same convention as HeroStrip/DailyBriefing).
  if (loading || !records.length) return null

  const visible = records.slice(0, windowSize(records))

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
                  {/* Positional, not r.wildCardRank — the API's rank ignores tiebreakers, so
                      after reordering its numbers would print out of sequence (2, 4, 3). */}
                  <td className="px-4 py-3 text-gray-500 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3 text-gray-900 flex items-center gap-2">
                    {isPhillies && <span className="w-1.5 h-1.5 rounded-full bg-phillies-red inline-block" />}
                    {r.team.teamName ?? r.team.name}
                    {r.clinchIndicator && (
                      <span className="text-xs font-normal text-green-600 uppercase" title="Clinched">
                        {r.clinchIndicator}
                      </span>
                    )}
                    {notes.has(r.team.id) && (
                      <span className="text-xs font-normal text-gray-400" title={notes.get(r.team.id)!.detail}>
                        †
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
      {notes.size > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          † Tied on record. Order set by MLB tiebreakers: head-to-head, then
          intradivision, then intraleague record.
        </p>
      )}
    </div>
  )
}
