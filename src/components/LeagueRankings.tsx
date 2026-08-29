import { useEffect, useState } from 'react'
import { fetchTeamStats } from '../api/mlb'
import { ordinal } from '../utils/playoffPush'
import {
  HITTING_CATEGORIES,
  PITCHING_CATEGORIES,
  rankCategories,
  type RankedCategory,
  type TeamStatSplit,
} from '../utils/rankings'

const PHILLIES_ID = 143

function RankTable({ title, rows }: { title: string; rows: RankedCategory[] }) {
  return (
    <div className="flex-1">
      <div className="card overflow-hidden">
        <div className="bg-gray-50 px-4 py-2.5">
          <span className="card-label">{title}</span>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {rows.map(row => (
              <tr key={row.key} className="hover:bg-gray-50">
                <th scope="row" className="px-4 py-2.5 text-left font-normal text-gray-600">
                  {row.label}
                </th>
                <td className="px-3 py-2.5 text-right font-semibold text-gray-900 tabular-nums">
                  {row.value}
                </td>
                {/* The rank, not the raw number, is what this panel exists for,
                    so it gets the display face — the same treatment PlayoffPush
                    gives its headline figures. */}
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <span className="font-display text-base text-phillies-navy">{ordinal(row.rank)}</span>
                  <span className="ml-1 text-xs text-gray-500">of {row.of}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Where the Phillies sit among all 30 clubs in the team categories a fan
 * actually argues about.
 *
 * Everything else on this tab measures the season in wins: the division table,
 * the wild card table, the push panel. None of it says whether this is a good
 * team — a club can be four games up while scoring less than everyone around
 * it. This is that context, and it is entirely arithmetic over MLB's own
 * published team totals: no projection, no composite index, no grade.
 */
export default function LeagueRankings() {
  const [hitting, setHitting] = useState<RankedCategory[] | null>(null)
  const [pitching, setPitching] = useState<RankedCategory[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    // Separate chains, not a Promise.all: a pitching failure must leave the
    // offense card standing, the same independence PlayoffPush gives its two
    // fetches. `settled` tracks both so the skeleton clears once, whichever
    // order they land in.
    let settled = 0
    const done = () => {
      settled += 1
      if (settled === 2 && !cancelled) setLoading(false)
    }

    const load = (
      group: 'hitting' | 'pitching',
      categories: typeof HITTING_CATEGORIES,
      set: (rows: RankedCategory[] | null) => void
    ) =>
      fetchTeamStats(group)
        .then((splits: TeamStatSplit[]) => {
          if (!cancelled) set(rankCategories(splits, PHILLIES_ID, categories))
        })
        .catch(() => {
          if (!cancelled) set(null)
        })
        .finally(done)

    load('hitting', HITTING_CATEGORIES, setHitting)
    load('pitching', PITCHING_CATEGORIES, setPitching)

    return () => {
      cancelled = true
    }
  }, [])

  // No skeleton: this panel sits at the very bottom of a tab whose tables have
  // their own, and reserving height for it would push the standings up the page
  // a beat after they painted.
  if (loading) return null
  // Self-hides when neither group came back — a failed request, or a season
  // early enough that MLB has no team totals yet. Same convention as
  // HeroStrip / BullpenUsage / MatchupPreview.
  const showHitting = hitting !== null && hitting.length > 0
  const showPitching = pitching !== null && pitching.length > 0
  if (!showHitting && !showPitching) return null

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-3">League Rankings</h2>
      {/* Side by side from sm up, stacked on a phone. flex-1 on each child means
          a lone survivor fills the row rather than sitting at half width. */}
      <div className="flex flex-col sm:flex-row gap-4">
        {showHitting && <RankTable title="Offense" rows={hitting} />}
        {showPitching && <RankTable title="Pitching" rows={pitching} />}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Season totals against all 30 clubs. Ties share the better rank. Strikeouts, walks and the
        runs, home runs and average allowed by the staff are ranked best-to-worst low.
      </p>
    </div>
  )
}
