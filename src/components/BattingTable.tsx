import { useEffect, useState } from 'react'
import { fetchBattingStats } from '../api/mlb'
import type { BattingStats, Player } from '../types/mlb'
import GameLogModal from './GameLogModal'

interface Split {
  player: Player
  stat: BattingStats
}

export default function BattingTable() {
  const [splits, setSplits] = useState<Split[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: keyof BattingStats; dir: 'asc' | 'desc' }>({ key: 'avg', dir: 'desc' })
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: number; name: string } | null>(null)

  useEffect(() => {
    fetchBattingStats()
      .then(setSplits)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-500">Loading batting stats…</div>
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>

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

  return (
    <>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
            <th className="px-4 py-3 text-left font-medium sticky left-0 bg-gray-50 min-w-36">Player</th>
            <th className="px-3 py-3 text-center font-medium">POS</th>
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
              onClick={() => setSelectedPlayer({ id: player.id, name: player.fullName })}
            >
              <td className="px-4 py-2.5 font-medium text-gray-900 sticky left-0 bg-white">{player.fullName}</td>
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
        onClose={() => setSelectedPlayer(null)}
      />
    )}
    </>
  )
}
