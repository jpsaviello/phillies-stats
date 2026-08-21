import { useEffect, useState } from 'react'
import { SEASON, fetchRosterWithStats } from '../api/mlb'
import type { RosterPlayer } from '../types/mlb'
import type { Favorite } from '../types/favorites'
import { formatSeasonLine, groupRoster, handedness, seasonLine } from '../utils/roster'
import GameLogModal from './GameLogModal'
import StarButton from './StarButton'
import { EmptyState, ErrorState, TableSkeleton } from './Feedback'
import type { BattingStats, PitchingStats } from '../types/mlb'

interface Props {
  signedIn: boolean
  favorites: Favorite[]
  onToggleFavorite: (playerId: number, playerName: string) => void
}

interface Selected {
  id: number
  name: string
  group: 'hitting' | 'pitching'
  stat: BattingStats | PitchingStats
}

export default function Roster({ signedIn, favorites, onToggleFavorite }: Props) {
  const [players, setPlayers] = useState<RosterPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchRosterWithStats()
      .then(setPlayers)
      .catch(e => {
        // Raw message stays in the console; fans get a readable sentence.
        console.error('Failed to load roster', e)
        setError("Couldn't load the roster right now.")
      })
      .finally(() => setLoading(false))
  }, [reloadKey])

  if (loading) return <TableSkeleton rows={14} cols={5} />
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey(k => k + 1)} />

  const sections = groupRoster(players)
  if (sections.length === 0) {
    return <EmptyState>No roster is available for the {SEASON} season yet.</EmptyState>
  }

  const starredIds = new Set(favorites.map(f => f.playerId))

  // A statless player has nothing for GameLogModal's season header or its trend
  // chart to render, so his row isn't clickable at all — an empty modal is worse
  // than an inert row.
  function open(p: RosterPlayer) {
    const line = seasonLine(p)
    if (!line) return
    setSelected({ id: p.person.id, name: p.person.fullName, group: line.group, stat: line.stat })
  }

  return (
    <>
      <div className="space-y-8">
        {sections.map(section => (
          <section key={section.id}>
            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-phillies-navy">
              {section.title}{' '}
              <span className="text-gray-400 font-semibold">({section.count})</span>
            </h2>
            {section.id === 'injured' && (
              // MLB's roster endpoint gives the designation and nothing else —
              // no diagnosis, no return date. Saying so is better than letting
              // the absence of that information read as an oversight.
              <p className="mt-1 text-xs text-gray-500">
                Designation only — MLB's roster feed carries no injury details or return dates.
              </p>
            )}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <th
                      scope="col"
                      className={`px-4 py-3 text-left font-medium sticky left-0 bg-gray-50 ${signedIn ? 'min-w-44' : 'min-w-36'}`}
                    >
                      Player
                    </th>
                    <th scope="col" className="px-3 py-3 text-center font-medium">#</th>
                    <th scope="col" className="px-3 py-3 text-center font-medium">Pos</th>
                    <th scope="col" className="px-3 py-3 text-center font-medium">B/T</th>
                    <th scope="col" className="px-3 py-3 text-center font-medium">Age</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium whitespace-nowrap">{SEASON} Season</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {section.subgroups.map(group => (
                    <RosterGroup
                      key={group.label}
                      label={group.label}
                      players={group.players}
                      signedIn={signedIn}
                      starredIds={starredIds}
                      onToggleFavorite={onToggleFavorite}
                      onOpen={open}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      {selected && (
        <GameLogModal
          personId={selected.id}
          playerName={selected.name}
          group={selected.group}
          seasonStat={selected.stat}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}

interface GroupProps {
  label: string
  players: RosterPlayer[]
  signedIn: boolean
  starredIds: Set<number>
  onToggleFavorite: (playerId: number, playerName: string) => void
  onOpen: (p: RosterPlayer) => void
}

// A fragment rather than its own <tbody>: the parent's divide-y draws the row
// separators, and a nested tbody per group would break that run.
function RosterGroup({ label, players, signedIn, starredIds, onToggleFavorite, onOpen }: GroupProps) {
  return (
    <>
      <tr className="bg-white">
        <th
          scope="colgroup"
          colSpan={6}
          className="px-4 pt-4 pb-1 text-left font-display text-xs font-semibold uppercase tracking-wider text-phillies-red"
        >
          {label}
        </th>
      </tr>
      {players.map(p => {
        const line = formatSeasonLine(p)
        const clickable = line !== null
        return (
          <tr
            key={p.person.id}
            // Same keyboard treatment as BattingTable's rows — without it the
            // modal would be mouse-only.
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-label={clickable ? `Game log for ${p.person.fullName}` : undefined}
            className={`group transition-colors ${
              clickable
                ? 'hover:bg-red-50 cursor-pointer focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-phillies-red'
                : ''
            }`}
            onClick={clickable ? () => onOpen(p) : undefined}
            onKeyDown={
              clickable
                ? e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpen(p)
                    }
                  }
                : undefined
            }
          >
            {/* Star lives inside the sticky cell, not in a column of its own —
                a column to its left would sit outside the frozen region. */}
            <td className="px-4 py-2.5 font-medium text-gray-900 sticky left-0 bg-white group-hover:bg-red-50 transition-colors">
              <span className="flex items-center gap-1.5">
                {signedIn && (
                  <StarButton
                    starred={starredIds.has(p.person.id)}
                    playerName={p.person.fullName}
                    onToggle={() => onToggleFavorite(p.person.id, p.person.fullName)}
                  />
                )}
                {p.person.fullName}
              </span>
            </td>
            {/* Blank for the five minors players who have no number — never "#undefined". */}
            <td className="px-3 py-2.5 text-center tabular-nums text-gray-500">{p.jerseyNumber || ''}</td>
            <td className="px-3 py-2.5 text-center text-gray-500">{p.position.abbreviation}</td>
            <td className="px-3 py-2.5 text-center text-gray-500">{handedness(p)}</td>
            <td className="px-3 py-2.5 text-center tabular-nums text-gray-500">{p.person.currentAge ?? '—'}</td>
            <td className="px-4 py-2.5 text-left tabular-nums whitespace-nowrap text-gray-700">
              {line ?? <span className="text-gray-400">No {SEASON} appearances</span>}
            </td>
          </tr>
        )
      })}
    </>
  )
}
