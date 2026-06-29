import { useEffect, useState } from 'react'
import { fetchPitchingStats } from '../api/mlb'
import type { PitchingStats, Player } from '../types/mlb'

interface Split {
  player: Player
  stat: PitchingStats
}

export default function PitchingTable() {
  const [splits, setSplits] = useState<Split[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<keyof PitchingStats>('era')

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
      const av = parseFloat(String(a.stat[sortKey])) || 0
      const bv = parseFloat(String(b.stat[sortKey])) || 0
      // For ERA/WHIP lower is better; for everything else higher is better
      const lowerIsBetter = sortKey === 'era' || sortKey === 'whip'
      return lowerIsBetter ? av - bv : bv - av
    })

  const cols: { key: keyof PitchingStats; label: string }[] = [
    { key: 'gamesPlayed', label: 'G' },
    { key: 'gamesStarted', label: 'GS' },
    { key: 'wins', label: 'W' },
    { key: 'losses', label: 'L' },
    { key: 'saves', label: 'SV' },
    { key: 'inningsPitched', label: 'IP' },
    { key: 'hits', label: 'H' },
    { key: 'homeRuns', label: 'HR' },
    { key: 'baseOnBalls', label: 'BB' },
    { key: 'strikeOuts', label: 'K' },
    { key: 'era', label: 'ERA' },
    { key: 'whip', label: 'WHIP' },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
            <th className="px-4 py-3 text-left font-medium sticky left-0 bg-gray-50 min-w-36">Player</th>
            {cols.map(c => (
              <th
                key={c.key}
                className={`px-3 py-3 text-center font-medium cursor-pointer hover:text-gray-900 whitespace-nowrap ${sortKey === c.key ? 'text-[#E81828] ' : ''}`}
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
