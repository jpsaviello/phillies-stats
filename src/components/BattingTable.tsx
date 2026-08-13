import { useEffect, useState } from 'react'
import { fetchBattingStats } from '../api/mlb'
import type { BattingStats, Player } from '../types/mlb'
import type { Favorite } from '../types/favorites'
import GameLogModal from './GameLogModal'
import StarButton from './StarButton'
import { EmptyState, ErrorState, TableSkeleton } from './Feedback'

interface Split {
  player: Player
  stat: BattingStats
}

interface Props {
  signedIn: boolean
  favorites: Favorite[]
  onToggleFavorite: (playerId: number, playerName: string) => void
}

export default function BattingTable({ signedIn, favorites, onToggleFavorite }: Props) {
  const [splits, setSplits] = useState<Split[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: keyof BattingStats; dir: 'asc' | 'desc' }>({ key: 'avg', dir: 'desc' })
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: number; name: string; stat: BattingStats } | null>(null)

  // Bumping reloadKey re-runs the fetch; it's what the error state's Try again
  // button drives.
  const [reloadKey, setReloadKey] = useState(0)

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

  if (loading) return <TableSkeleton rows={12} cols={9} />
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey(k => k + 1)} />

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

  // Previously this rendered a header row over a blank body with no explanation.
  if (sorted.length === 0) {
    return <EmptyState>No batters have recorded an at-bat yet this season.</EmptyState>
  }

  // Built once per render rather than scanning `favorites` per row.
  const starredIds = new Set(favorites.map(f => f.playerId))

  return (
    <>
    <div className="overflow-x-auto">
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
          {sorted.map(({ player, stat }) => (
            <tr
              key={player.id}
              // Same keyboard treatment as Schedule.tsx's clickable game rows —
              // without it the whole GameLogModal feature is mouse-only.
              role="button"
              tabIndex={0}
              aria-label={`Game log for ${player.fullName}`}
              className="group hover:bg-red-50 transition-colors cursor-pointer focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-phillies-red"
              onClick={() => setSelectedPlayer({ id: player.id, name: player.fullName, stat })}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelectedPlayer({ id: player.id, name: player.fullName, stat })
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
    </div>
    {selectedPlayer && (
      <GameLogModal
        personId={selectedPlayer.id}
        playerName={selectedPlayer.name}
        group="hitting"
        seasonStat={selectedPlayer.stat}
        onClose={() => setSelectedPlayer(null)}
      />
    )}
    </>
  )
}
