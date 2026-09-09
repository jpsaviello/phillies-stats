import { NL_LEAGUE_ID } from '../api/mlb'
import { useDivisionLeaders } from '../hooks/useDivisionLeaders'
import { useDivisionRace } from '../hooks/useDivisionRace'
import { useWildCardRace } from '../hooks/useWildCardRace'
import LeagueRankings from './LeagueRankings'
import PlayoffPicture from './PlayoffPicture'
import PlayoffPush from './PlayoffPush'
import WildCardStandings from './WildCardStandings'
import { EmptyState, ErrorState, TableSkeleton } from './Feedback'

const PHILLIES_ID = 143

interface Props {
  // Independent self-hiding panels, same arrangement as the other flag-gated
  // panels. Default on so an unreachable LD client renders them.
  enableLeagueRankings?: boolean
  enablePlayoffPicture?: boolean
}

export default function Standings({ enableLeagueRankings = true, enablePlayoffPicture = true }: Props) {
  // Both races are owned here rather than in the children: the panel and the
  // tables state the same positions, and the tiebreaker round trips are expensive
  // enough that fetching them twice would be wasteful as well as divergence-prone.
  const { records, notes, loading, error, reload } = useDivisionRace()
  const race = useWildCardRace()
  // Costs no request of its own: fetchDivisionLeaders(NL) reads the same
  // standings URL useDivisionRace already asked for, so the bracket's NL half is
  // served from that cache entry. The bracket's AL half owns its own two
  // requests — nothing else in the app wants them.
  const leaders = useDivisionLeaders(NL_LEAGUE_ID)

  // The panel and the wild card table both fail silently on their own, so they
  // render alongside the division table rather than inside its loading/error
  // states — a standings failure doesn't take either of them down.
  // WildCardStandings renders null on exactly this condition, so the parent can
  // tell whether the right-hand column will have anything in it before laying
  // the grid out — the same question Today answers with `twoUp`.
  const showWildCard = !race.loading && race.records.length > 0
  const twoUp = showWildCard || enableLeagueRankings

  return (
    <div className="space-y-8">
      {/* Full width, above the grid: the bracket is neither the division column
          nor the race column, it is the tab's headline, and two bye cards
          beside two series cards want the whole width to do it. */}
      {enablePlayoffPicture && <PlayoffPicture wildCard={race} divisionLeaders={leaders} />}

      {/*
        Two columns from `lg` up, one below it.

        The tab reads division-on-the-left, race-on-the-right: where the club sits
        in the NL East beside where it sits in the wild card and among all 30
        clubs. It was a single `max-w-2xl` column pinned to the left edge, which
        left more than half of a 1280px screen empty and read as an unfinished
        page rather than as a reading column. Same structure and the same
        reasoning as the Today tab, which solved this first.

        When the right column has nothing to show, the grid drops to one centered
        column rather than stranding the division table beside a void.
      */}
      <div className={twoUp ? 'grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start' : 'max-w-2xl mx-auto space-y-8'}>
      <div className="space-y-8 min-w-0">
      <PlayoffPush divisionRecords={records} {...race} />
      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : records.length === 0 ? (
        <EmptyState>No standings available yet.</EmptyState>
      ) : (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">NL East Standings</h2>
          {/* Card chrome matches the wild card table below it — the two sit in
              the same scroll view and were styled differently. */}
          <table className="w-full text-sm card overflow-hidden">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th scope="col" className="px-4 py-3 text-left font-medium">Team</th>
                <th scope="col" className="px-4 py-3 text-center font-medium">W</th>
                <th scope="col" className="px-4 py-3 text-center font-medium">L</th>
                <th scope="col" className="px-4 py-3 text-center font-medium">PCT</th>
                <th scope="col" className="px-4 py-3 text-center font-medium">GB</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map(r => {
                const isPhillies = r.team.id === PHILLIES_ID
                return (
                  <tr
                    key={r.team.id}
                    className={isPhillies ? 'bg-hover font-semibold' : 'hover:bg-gray-50'}
                  >
                    {/* flex on a span, not the <td> — see WildCardStandings. */}
                    <td className="px-4 py-3 text-gray-900">
                      <span className="flex items-center gap-2">
                        {isPhillies && <span className="w-1.5 h-1.5 rounded-full bg-phillies-red inline-block" />}
                        {r.team.name}
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
                    <td className="px-4 py-3 text-center tabular-nums">{r.wins === 0 && r.losses === 0 ? '—' : (r.wins / (r.wins + r.losses)).toFixed(3)}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.gamesBack}</td>
                  </tr>
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
      )}
      </div>

      <div className="space-y-8 min-w-0">
      <WildCardStandings {...race} />
      {/* Outside the standings fetch's branches: it owns its own two requests
          and renders nothing when both fail, so a standings error can't take it
          down and it can't take them down. */}
      {enableLeagueRankings && <LeagueRankings />}
      </div>
    </div>
    </div>
  )
}
