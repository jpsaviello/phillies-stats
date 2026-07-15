import { useEffect, useState } from 'react'
import { fetchStandings } from '../api/mlb'
import type { StandingsRecord } from '../types/mlb'

const PHILLIES_ID = 143

export default function Standings() {
  const [records, setRecords] = useState<StandingsRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStandings()
      .then(setRecords)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-500">Loading standings…</div>
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">NL East Standings</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
            <th className="px-4 py-3 text-left font-medium">Team</th>
            <th className="px-4 py-3 text-center font-medium">W</th>
            <th className="px-4 py-3 text-center font-medium">L</th>
            <th className="px-4 py-3 text-center font-medium">PCT</th>
            <th className="px-4 py-3 text-center font-medium">GB</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {records.map(r => {
            const isPhillies = r.team.id === PHILLIES_ID
            return (
              <tr
                key={r.team.id}
                className={isPhillies ? 'bg-red-50 font-semibold' : 'hover:bg-gray-50'}
              >
                <td className="px-4 py-3 text-gray-900 flex items-center gap-2">
                  {isPhillies && <span className="w-1.5 h-1.5 rounded-full bg-phillies-red inline-block" />}
                  {r.team.name}
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
    </div>
  )
}
