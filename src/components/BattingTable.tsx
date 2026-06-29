import { useEffect, useState } from 'react'
import { fetchBattingStats } from '../api/mlb'
import type { BattingStats, Player } from '../types/mlb'

interface Split {
  player: Player
  stat: BattingStats
}

export default function BattingTable() {
  const [splits, setSplits] = useState<Split[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<keyof BattingStats>('avg')

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
      const av = parseFloat(String(a.stat[sortKey])) || 0
      const bv = parseFloat(String(b.stat[sortKey])) || 0
      return bv - av
    })

  const cols: { key: keyof BattingStats; label: string }[] = [
    { key: 'gamesPlayed', label: 'G' },
    { key: 'atBats', label: 'AB' },
    { key: 'runs', label: 'R' },
    { key: 'hits', label: 'H' },
    { key: 'doubles', label: '2B' },
    { key: 'triples', label: '3B' },
    { key: 'homeRuns', label: 'HR' },
    { key: 'rbi', label: 'RBI' },
    { key: 'stolenBases', label: 'SB' },
    { key: 'baseOnBalls', label: 'BB' },
    { key: 'strikeOuts', label: 'K' },
    { key: 'avg', label: 'AVG' },
    { key: 'obp', label: 'OBP' },
    { key: 'slg', label: 'SLG' },
    { key: 'ops', label: 'OPS' },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
            <th className="px-4 py-3 text-left font-medium sticky left-0 bg-gray-50 min-w-36">Player</th>
            <th className="px-3 py-3 text-center font-medium">POS</th>
            {cols.map(c => (
              <th
                key={c.key}
                className={`px-3 py-3 text-center font-medium cursor-pointer hover:text-gray-900 whitespace-nowrap ${sortKey === c.key ? 'text-[#E81828]' : ''}`}
                onClick={() => setSortKey(c.key)}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map(({ player, stat }) => (
            <tr key={player.id} className="hover:bg-red-50 transition-colors">
              <td className="px-4 py-2.5 font-medium text-gray-900 sticky left-0 bg-white">{player.fullName}</td>
              <td className="px-3 py-2.5 text-center text-gray-500">{player.primaryPosition?.abbreviation}</td>
              {cols.map(c => (
                <td key={c.key} className={`px-3 py-2.5 text-center tabular-nums ${sortKey === c.key ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                  {stat[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
