import { useEffect, useState } from 'react'
import { fetchPitchingStats } from '../api/mlb'
import type { PitchingStats, Player } from '../types/mlb'
import GameLogModal from './GameLogModal'

interface Split {
  player: Player
  stat: PitchingStats
}

export default function PitchingTable() {
  const [splits, setSplits] = useState<Split[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: keyof PitchingStats; dir: 'asc' | 'desc' }>({ key: 'era', dir: 'asc' })
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: number; name: string; stat: PitchingStats } | null>(null)

  useEffect(() => {
    fetchPitchingStats()
      .then(setSplits)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-500">Loading pitching stats…</div>
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>

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

  return (
    <>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
            <th className="px-4 py-3 text-left font-medium sticky left-0 bg-gray-50 min-w-36">Player</th>
            {cols.map(c => (
              <th
                key={c.key}
                className={`px-3 py-3 text-center font-medium cursor-pointer hover:text-gray-900 whitespace-nowrap ${sort.key === c.key ? 'text-phillies-red' : ''}`}
                onClick={() =>
                  setSort(prev =>
                    prev.key === c.key
                      ? { key: c.key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
                      : { key: c.key, dir: c.defaultDir }
                  )
                }
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map(({ player, stat }) => (
            <tr
              key={player.id}
              className="hover:bg-red-50 transition-colors cursor-pointer"
              onClick={() => setSelectedPlayer({ id: player.id, name: player.fullName, stat })}
            >
              <td className="px-4 py-2.5 font-medium text-gray-900 sticky left-0 bg-white">{player.fullName}</td>
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
        group="pitching"
        seasonStat={selectedPlayer.stat}
        onClose={() => setSelectedPlayer(null)}
      />
    )}
    </>
  )
}
