import { Fragment } from 'react'
import { PLAYOFF_SPOTS, windowSize, type WildCardRace } from '../hooks/useWildCardRace'

const PHILLIES_ID = 143

// The fetch and tiebreak live in useWildCardRace, owned by Standings, because
// PlayoffPush states a playoff position from the same ordering — see that hook.
export default function WildCardStandings({ records, notes, loading }: WildCardRace) {
  // Secondary widget on someone else's tab: render nothing rather than a
  // skeleton or an error banner (same convention as HeroStrip/DailyBriefing).
  if (loading || !records.length) return null

  const visible = records.slice(0, windowSize(records))

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-3">NL Wild Card Race</h2>
      <table className="w-full text-sm card overflow-hidden">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
            <th scope="col" className="px-4 py-3 text-left font-medium w-8">#</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Team</th>
            <th scope="col" className="px-4 py-3 text-center font-medium">W</th>
            <th scope="col" className="px-4 py-3 text-center font-medium">L</th>
            <th scope="col" className="px-4 py-3 text-center font-medium">GB</th>
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
                  {/* The flex lives on a span, not the <td>: display:flex on a
                      cell drops it out of table layout, so the column stops
                      negotiating its width with the header. */}
                  <td className="px-4 py-3 text-gray-900">
                    <span className="flex items-center gap-2">
                      {isPhillies && <span className="w-1.5 h-1.5 rounded-full bg-phillies-red inline-block" />}
                      {r.team.teamName ?? r.team.name}
                      {r.clinchIndicator && (
                        <span
                          className="text-xs font-normal text-green-700 uppercase"
                          aria-label="Clinched"
                          title="Clinched"
                        >
                          {r.clinchIndicator}
                        </span>
                      )}
                      {notes.has(r.team.id) && (
                        <span
                          className="text-xs font-normal text-gray-500"
                          aria-label={notes.get(r.team.id)!.detail}
                          title={notes.get(r.team.id)!.detail}
                        >
                          †
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">{r.wins}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{r.losses}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{r.wildCardGamesBack}</td>
                </tr>
                {i === PLAYOFF_SPOTS - 1 && i < visible.length - 1 && (
                  <tr className="bg-gray-50">
                    <td
                      colSpan={5}
                      className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600 border-t-2 border-dashed border-gray-400"
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
