import { useEffect, useState } from 'react'
import { fetchGameLog } from '../api/mlb'
import type { GameLogSplit, BattingGameStat, PitchingGameStat } from '../types/mlb'

interface Props {
  personId: number
  playerName: string
  group: 'hitting' | 'pitching'
  onClose: () => void
}

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function GameLogModal({ personId, playerName, group, onClose }: Props) {
  const [games, setGames] = useState<GameLogSplit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchGameLog(personId, group)
      .then(setGames)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [personId, group])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{playerName} — Last 10 Games</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-2">
            &times;
          </button>
        </div>
        <div className="p-4">
          {loading && <div className="text-center text-gray-500 py-6">Loading…</div>}
          {error && <div className="text-center text-red-600 py-6">{error}</div>}
          {!loading && !error && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase">
                  <th className="text-left font-medium py-2">Date</th>
                  <th className="text-left font-medium py-2">Opp</th>
                  {group === 'hitting' ? (
                    <>
                      <th className="text-center font-medium py-2">AB</th>
                      <th className="text-center font-medium py-2">R</th>
                      <th className="text-center font-medium py-2">H</th>
                      <th className="text-center font-medium py-2">HR</th>
                      <th className="text-center font-medium py-2">RBI</th>
                      <th className="text-center font-medium py-2">BB</th>
                      <th className="text-center font-medium py-2">K</th>
                    </>
                  ) : (
                    <>
                      <th className="text-center font-medium py-2">IP</th>
                      <th className="text-center font-medium py-2">H</th>
                      <th className="text-center font-medium py-2">R</th>
                      <th className="text-center font-medium py-2">ER</th>
                      <th className="text-center font-medium py-2">BB</th>
                      <th className="text-center font-medium py-2">K</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {games.map((g, i) => (
                  <tr key={i}>
                    <td className="py-2 text-gray-700 whitespace-nowrap">{formatDate(g.date)}</td>
                    <td className="py-2 text-gray-700 whitespace-nowrap">
                      {(g.isHome ? 'vs ' : '@ ') + g.opponent.name}
                    </td>
                    {group === 'hitting'
                      ? (() => {
                          const s = g.stat as BattingGameStat
                          return (
                            <>
                              <td className="text-center tabular-nums">{s.atBats}</td>
                              <td className="text-center tabular-nums">{s.runs}</td>
                              <td className="text-center tabular-nums">{s.hits}</td>
                              <td className="text-center tabular-nums">{s.homeRuns}</td>
                              <td className="text-center tabular-nums">{s.rbi}</td>
                              <td className="text-center tabular-nums">{s.baseOnBalls}</td>
                              <td className="text-center tabular-nums">{s.strikeOuts}</td>
                            </>
                          )
                        })()
                      : (() => {
                          const s = g.stat as PitchingGameStat
                          return (
                            <>
                              <td className="text-center tabular-nums">{s.inningsPitched}</td>
                              <td className="text-center tabular-nums">{s.hits}</td>
                              <td className="text-center tabular-nums">{s.runs}</td>
                              <td className="text-center tabular-nums">{s.earnedRuns}</td>
                              <td className="text-center tabular-nums">{s.baseOnBalls}</td>
                              <td className="text-center tabular-nums">{s.strikeOuts}</td>
                            </>
                          )
                        })()}
                  </tr>
                ))}
                {games.length === 0 && (
                  <tr>
                    <td colSpan={group === 'hitting' ? 9 : 8} className="text-center text-gray-400 py-6">
                      No recent games.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
