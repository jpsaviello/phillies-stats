import { useEffect, useState } from 'react'
import { fetchPitchingStats } from '../api/mlb'
import { dismiss, navigate, useRoute } from '../hooks/useRoute'
import type { PitchingStats, Player } from '../types/mlb'
import type { Favorite } from '../types/favorites'
import BullpenUsage from './BullpenUsage'
import GameLogModal from './GameLogModal'
import StarButton from './StarButton'
import { EmptyState, ErrorState, TableSkeleton } from './Feedback'

interface Split {
  player: Player
  stat: PitchingStats
}

interface Props {
  signedIn: boolean
  favorites: Favorite[]
  onToggleFavorite: (playerId: number, playerName: string) => void
  // Independent self-hiding panel — see BullpenUsage / bullpen-usage design
  // spec decision 3. Not yet a LaunchDarkly flag; defaults on like
  // enableMatchupPreview did before its flag existed.
  enableBullpenUsage?: boolean
}

export default function PitchingTable({ signedIn, favorites, onToggleFavorite, enableBullpenUsage = true }: Props) {
  const [splits, setSplits] = useState<Split[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: keyof PitchingStats; dir: 'asc' | 'desc' }>({ key: 'era', dir: 'asc' })
  // Read from the URL, same as BattingTable — see the note there.
  const { player: openPlayerId } = useRoute()

  // See BattingTable — reloadKey drives the error state's Try again button.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchPitchingStats()
      .then(setSplits)
      .catch(e => {
        console.error('Failed to load pitching stats', e)
        setError("Couldn't load pitching stats right now.")
      })
      .finally(() => setLoading(false))
  }, [reloadKey])

  // Looked up in `splits`, not the filtered rows, so a link to a pitcher with
  // no innings still opens; null until the fetch lands, which is what restores
  // the modal from a cold URL.
  const selected = openPlayerId === null ? null : splits.find(s => s.player.id === openPlayerId) ?? null

  const sorted = [...splits]
    .filter(s => parseFloat(s.stat.inningsPitched) > 0)
    .sort((a, b) => {
      const av = parseFloat(String(a.stat[sort.key])) || 0
      const bv = parseFloat(String(b.stat[sort.key])) || 0
      return sort.dir === 'asc' ? av - bv : bv - av
    })

  const cols: { key: keyof PitchingStats; label: string; defaultDir: 'asc' | 'desc' }[] = [
    { key: 'gamesPlayed', label: 'G', defaultDir: 'desc' },
    { key: 'gamesStarted', label: 'GS', defaultDir: 'desc' },
    { key: 'wins', label: 'W', defaultDir: 'desc' },
    { key: 'losses', label: 'L', defaultDir: 'desc' },
    { key: 'saves', label: 'SV', defaultDir: 'desc' },
    { key: 'inningsPitched', label: 'IP', defaultDir: 'desc' },
    { key: 'hits', label: 'H', defaultDir: 'desc' },
    { key: 'homeRuns', label: 'HR', defaultDir: 'desc' },
    { key: 'baseOnBalls', label: 'BB', defaultDir: 'desc' },
    { key: 'strikeOuts', label: 'K', defaultDir: 'desc' },
    { key: 'era', label: 'ERA', defaultDir: 'asc' },
    { key: 'whip', label: 'WHIP', defaultDir: 'asc' },
  ]

  // Built once per render rather than scanning `favorites` per row.
  const starredIds = new Set(favorites.map(f => f.playerId))

  return (
    <>
      {/* Owns its own fetch/failure and self-hides — a season-stats error here
          must not take it down, so it sits outside the loading/error/empty
          branches below, same convention as PlayoffPush / WildCardStandings on
          the Standings tab. Passed `splits` (not re-fetched) for SP/RP
          classification — see the bullpen-usage design spec decision 3. */}
      {enableBullpenUsage && <BullpenUsage seasonSplits={splits} />}

      {loading ? (
        <TableSkeleton rows={12} cols={8} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setReloadKey(k => k + 1)} />
      ) : sorted.length === 0 ? (
        <EmptyState>No pitchers have thrown an inning yet this season.</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                  {/* Wider only when the star is rendered — see BattingTable. */}
                  <th scope="col" className={`px-4 py-3 text-left font-medium sticky left-0 bg-gray-50 ${signedIn ? 'min-w-44' : 'min-w-36'}`}>Player</th>
                  {cols.map(c => {
                    const active = sort.key === c.key
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className="px-3 py-3 text-center font-medium whitespace-nowrap"
                      >
                        {/* Real <button>, sort arrow — see the matching comment in BattingTable. */}
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
                    // Keyboard treatment mirrors BattingTable / Schedule.
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
                    {/* Star inside the sticky cell, not a column of its own — see the
                        matching comment in BattingTable. */}
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
          {selected && (
            <GameLogModal
              personId={selected.player.id}
              playerName={selected.player.fullName}
              group="pitching"
              seasonStat={selected.stat}
              onClose={() => dismiss({ player: null })}
            />
          )}
        </>
      )}
    </>
  )
}
