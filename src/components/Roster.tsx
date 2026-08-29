import { useEffect, useState } from 'react'
import { SEASON, fetchRosterWithStats } from '../api/mlb'
import { dismiss, navigate, useRoute } from '../hooks/useRoute'
import type { RosterPlayer } from '../types/mlb'
import type { Favorite } from '../types/favorites'
import { formatSeasonLine, groupRoster, handedness, seasonLine } from '../utils/roster'
import GameLogModal from './GameLogModal'
import PlayerSearch from './PlayerSearch'
import ScrollX from './ScrollX'
import StarButton from './StarButton'
import { EmptyState, ErrorState, NoMatches, TableSkeleton } from './Feedback'
import { matchesQuery } from '../utils/search'
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
  // Read from the URL, same as the Batting/Pitching tables — see the note there.
  const { player: openPlayerId } = useRoute()
  const [reloadKey, setReloadKey] = useState(0)
  // Component state, not a URL param — see the note in BattingTable.
  const [query, setQuery] = useState('')

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

  // Keyed on the UNFILTERED list: "no roster yet" is a data condition the reader
  // can do nothing about, and it must not be reachable by typing a query.
  if (players.length === 0) {
    return <EmptyState>No roster is available for the {SEASON} season yet.</EmptyState>
  }

  // Filtered BEFORE grouping, so section counts ("Active Roster (26)") and the
  // position subgroups describe what is actually rendered rather than the roster
  // they were drawn from. Sections left with nobody drop out on their own —
  // groupRoster already filters zero-count sections.
  const matched = players.filter(p => matchesQuery(p.person.fullName, query))
  const sections = groupRoster(matched)

  const starredIds = new Set(favorites.map(f => f.playerId))

  // A statless player has nothing for GameLogModal's season header or its trend
  // chart to render, so his row isn't clickable at all — an empty modal is worse
  // than an inert row.
  function open(p: RosterPlayer) {
    if (!seasonLine(p)) return
    navigate({ player: p.person.id })
  }

  // Rebuilt from the URL + loaded roster rather than captured at click time, so
  // a link straight to ?player= opens the same modal a click would have.
  const openPlayer = openPlayerId === null ? null : players.find(p => p.person.id === openPlayerId)
  const openLine = openPlayer ? seasonLine(openPlayer) : null
  const selected: Selected | null =
    openPlayer && openLine
      ? { id: openPlayer.person.id, name: openPlayer.person.fullName, group: openLine.group, stat: openLine.stat }
      : null

  return (
    <>
      <PlayerSearch
        value={query}
        onChange={setQuery}
        shown={matched.length}
        total={players.length}
        label="Search the roster"
        placeholder="Search the roster…"
      />
      {sections.length === 0 ? (
        <NoMatches query={query} noun="players" onClear={() => setQuery('')} />
      ) : (
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
            <ScrollX className="mt-3">
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
            </ScrollX>
          </section>
        ))}
      </div>
      )}
      {selected && (
        <GameLogModal
          personId={selected.id}
          playerName={selected.name}
          group={selected.group}
          seasonStat={selected.stat}
          onClose={() => dismiss({ player: null })}
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
