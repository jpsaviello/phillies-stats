import { useEffect, useState } from 'react'
import { fetchBattingStats } from '../api/mlb'
import { dismiss, navigate, useRoute } from '../hooks/useRoute'
import type { BattingStats, Player } from '../types/mlb'
import type { Favorite } from '../types/favorites'
import BattingForm from './BattingForm'
import GameLogModal from './GameLogModal'
import PlayerSearch from './PlayerSearch'
import ScrollX from './ScrollX'
import StarButton from './StarButton'
import { EmptyState, ErrorState, NoMatches, TableSkeleton } from './Feedback'
import { matchesQuery } from '../utils/search'

interface Split {
  player: Player
  stat: BattingStats
}

interface Props {
  signedIn: boolean
  favorites: Favorite[]
  onToggleFavorite: (playerId: number, playerName: string) => void
  // Independent self-hiding panel, same arrangement as enableBullpenUsage on
  // the Pitching tab. Defaults on so an unreachable LD client renders it.
  enableBattingForm?: boolean
}

export default function BattingTable({ signedIn, favorites, onToggleFavorite, enableBattingForm = true }: Props) {
  const [splits, setSplits] = useState<Split[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: keyof BattingStats; dir: 'asc' | 'desc' }>({ key: 'avg', dir: 'desc' })
  // Which player's game log is open is read from the URL rather than held in
  // state: that makes the modal linkable, and makes Back close it instead of
  // leaving the site. Deriving it (rather than syncing state to the URL) means
  // there is only ever one source of truth to disagree with.
  const { player: openPlayerId } = useRoute()

  // Bumping reloadKey re-runs the fetch; it's what the error state's Try again
  // button drives.
  const [reloadKey, setReloadKey] = useState(0)

  // Component state rather than a URL param: navigate() pushes a history entry,
  // so a per-keystroke `q` would make Back walk the search backwards a letter at
  // a time. See PlayerSearch.
  const [query, setQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchBattingStats()
      .then(setSplits)
      .catch(e => {
        // The raw message stays in the console; fans get a readable sentence.
        console.error('Failed to load batting stats', e)
        setError("Couldn't load batting stats right now.")
      })
      .finally(() => setLoading(false))
  }, [reloadKey])

  // Looked up in `splits`, not the filtered/sorted rows, so a link to a player
  // with no at-bats still opens. Resolves to null until the fetch lands, which
  // is what lets a cold URL restore the modal once data arrives.
  const selected = openPlayerId === null ? null : splits.find(s => s.player.id === openPlayerId) ?? null

  const sorted = [...splits]
    .filter(s => s.stat.atBats > 0)
    .sort((a, b) => {
      const av = parseFloat(String(a.stat[sort.key])) || 0
      const bv = parseFloat(String(b.stat[sort.key])) || 0
      return sort.dir === 'desc' ? bv - av : av - bv
    })

  const cols: { key: keyof BattingStats; label: string; defaultDir: 'asc' | 'desc' }[] = [
    { key: 'gamesPlayed', label: 'G', defaultDir: 'desc' },
    { key: 'atBats', label: 'AB', defaultDir: 'desc' },
    { key: 'runs', label: 'R', defaultDir: 'desc' },
    { key: 'hits', label: 'H', defaultDir: 'desc' },
    { key: 'doubles', label: '2B', defaultDir: 'desc' },
    { key: 'triples', label: '3B', defaultDir: 'desc' },
    { key: 'homeRuns', label: 'HR', defaultDir: 'desc' },
    { key: 'rbi', label: 'RBI', defaultDir: 'desc' },
    { key: 'stolenBases', label: 'SB', defaultDir: 'desc' },
    { key: 'baseOnBalls', label: 'BB', defaultDir: 'desc' },
    { key: 'strikeOuts', label: 'K', defaultDir: 'desc' },
    { key: 'avg', label: 'AVG', defaultDir: 'desc' },
    { key: 'obp', label: 'OBP', defaultDir: 'desc' },
    { key: 'slg', label: 'SLG', defaultDir: 'desc' },
    { key: 'ops', label: 'OPS', defaultDir: 'desc' },
  ]

  // Filtered after sorting and after the atBats gate, so the denominator in
  // "8 of 26" is the number of rows this tab would have shown anyway.
  const rows = sorted.filter(s => matchesQuery(s.player.fullName, query))

  // Built once per render rather than scanning `favorites` per row.
  const starredIds = new Set(favorites.map(f => f.playerId))

  return (
    <>
      {/* Owns its own fetch and self-hides, so a season-stats failure here must
          not take it down: it sits outside the loading/error/empty branches
          below, the same single-return shape PitchingTable uses for
          BullpenUsage. Passed `splits` rather than re-fetching them, which is
          what gives each row its season-OPS baseline for free. */}
      {enableBattingForm && <BattingForm seasonSplits={splits} />}

      {loading ? (
        <TableSkeleton rows={12} cols={9} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setReloadKey(k => k + 1)} />
      ) : sorted.length === 0 ? (
        // Keyed on `sorted`, not `rows`: an empty table has nothing to search,
        // so the search box is not rendered at all in that case.
        <EmptyState>No batters have recorded an at-bat yet this season.</EmptyState>
      ) : (
        <>
        <PlayerSearch
          value={query}
          onChange={setQuery}
          shown={rows.length}
          total={sorted.length}
          label="Search batters"
          placeholder="Search batters…"
        />
        {rows.length === 0 ? (
          <NoMatches query={query} noun="batters" onClear={() => setQuery('')} />
        ) : (
        <ScrollX>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                {/* Wider only when the star is rendered — it eats ~22px of the cell,
                    which wrapped most names onto two lines at 375px. Signed-out
                    stays at the original min-w-36. */}
                <th scope="col" className={`px-4 py-3 text-left font-medium sticky left-0 bg-gray-50 ${signedIn ? 'min-w-44' : 'min-w-36'}`}>Player</th>
                <th scope="col" className="px-3 py-3 text-center font-medium">POS</th>
                {cols.map(c => {
                  const active = sort.key === c.key
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className="px-3 py-3 text-center font-medium whitespace-nowrap"
                    >
                      {/* A real <button> rather than a click handler on the <th>: the
                          header was previously keyboard-dead, so sorting was
                          mouse-only. */}
                      <button
                        type="button"
                        className={`inline-flex items-center gap-0.5 uppercase rounded hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-phillies-red/40 ${active ? 'text-phillies-red' : ''}`}
                        onClick={() =>
                          setSort(prev =>
                            prev.key === c.key
                              ? { key: c.key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
                              : { key: c.key, dir: c.defaultDir }
                          )
                        }
                      >
                        {c.label}
                        {/* Direction was previously invisible — the active column was
                            tinted but nothing indicated which way it sorted. */}
                        {active && <span aria-hidden="true">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ player, stat }) => (
                <tr
                  key={player.id}
                  // Same keyboard treatment as Schedule.tsx's clickable game rows —
                  // without it the whole GameLogModal feature is mouse-only.
                  role="button"
                  tabIndex={0}
                  aria-label={`Game log for ${player.fullName}`}
                  className="group hover:bg-red-50 transition-colors cursor-pointer focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-phillies-red"
                  onClick={() => navigate({ player: player.id })}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate({ player: player.id })
                    }
                  }}
                >
                  {/* The star lives INSIDE this cell rather than in a column of its
                      own: this cell is sticky left-0, and a column to its left would
                      sit outside the frozen region and break the geometry.
                      group-hover mirrors the row tint — an opaque background is
                      required for the sticky cell, so it can't inherit the row's. */}
                  <td className="px-4 py-2.5 font-medium text-gray-900 sticky left-0 bg-white group-hover:bg-red-50 transition-colors">
                    <span className="flex items-center gap-1.5">
                      {signedIn && (
                        <StarButton
                          starred={starredIds.has(player.id)}
                          playerName={player.fullName}
                          onToggle={() => onToggleFavorite(player.id, player.fullName)}
                        />
                      )}
                      {player.fullName}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-500">{player.primaryPosition?.abbreviation}</td>
                  {cols.map(c => (
                    <td key={c.key} className={`px-3 py-2.5 text-center tabular-nums ${sort.key === c.key ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                      {stat[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
        )}
        {selected && (
          <GameLogModal
            personId={selected.player.id}
            playerName={selected.player.fullName}
            group="hitting"
            seasonStat={selected.stat}
            onClose={() => dismiss({ player: null })}
          />
        )}
        </>
      )}
    </>
  )
}
