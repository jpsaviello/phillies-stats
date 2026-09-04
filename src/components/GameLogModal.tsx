import { useEffect, useMemo, useState } from 'react'
import { fetchGameLog, fetchSplits, playerHeadshotUrl } from '../api/mlb'
import type {
  GameLogSplit,
  BattingGameStat,
  PitchingGameStat,
  BattingStats,
  PitchingStats,
  StatSplit,
} from '../types/mlb'
import { rollingAvg, cumulativeHomeRuns, opsProgression, eraProgression, strikeoutsPerGame } from '../utils/trends'
import TrendChart from './TrendChart'

const TREND_STATS = {
  hitting: [
    { label: 'Rolling AVG', compute: rollingAvg, format: (v: number) => v.toFixed(3).replace(/^0/, '') },
    { label: 'HR Pace', compute: cumulativeHomeRuns, format: (v: number) => String(Math.round(v)) },
    { label: 'OPS', compute: opsProgression, format: (v: number) => (v < 1 ? v.toFixed(3).replace(/^0/, '') : v.toFixed(3)) },
  ],
  pitching: [
    { label: 'ERA', compute: eraProgression, format: (v: number) => v.toFixed(2) },
    { label: "K's / Game", compute: strikeoutsPerGame, format: (v: number) => String(Math.round(v)) },
  ],
} as const

interface Props {
  personId: number
  playerName: string
  group: 'hitting' | 'pitching'
  seasonStat: BattingStats | PitchingStats
  onClose: () => void
}

// Order + display labels for the situational sitCodes we request. For pitchers,
// vl/vr are batter-handedness splits (vs LHB/RHB), not opposing-pitcher splits.
const SPLIT_ORDER = ['vl', 'vr', 'h', 'a'] as const
const SPLIT_LABELS: Record<'hitting' | 'pitching', Record<string, string>> = {
  hitting: { vl: 'vs LHP', vr: 'vs RHP', h: 'Home', a: 'Away' },
  pitching: { vl: 'vs LHB', vr: 'vs RHB', h: 'Home', a: 'Away' },
}

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="card-label">{label}</div>
      <div className="font-display text-2xl font-bold text-mark tabular-nums mt-0.5">{value}</div>
    </div>
  )
}

export default function GameLogModal({ personId, playerName, group, seasonStat, onClose }: Props) {
  const [season, setSeason] = useState<GameLogSplit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statIndex, setStatIndex] = useState(0)
  const [splits, setSplits] = useState<StatSplit[]>([])
  const games = [...season].slice(-10).reverse()

  const stats = TREND_STATS[group]
  const trendPoints = useMemo(() => stats[statIndex].compute(season), [stats, statIndex, season])

  // Order splits by our requested sitCodes; the API may omit some for small samples.
  const orderedSplits = useMemo(
    () =>
      SPLIT_ORDER.map(code => splits.find(s => s.split.code === code)).filter(
        (s): s is StatSplit => s != null
      ),
    [splits]
  )

  useEffect(() => {
    setLoading(true)
    fetchGameLog(personId, group)
      .then(setSeason)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [personId, group])

  // Splits load independently so a failure here never blanks the trend/table.
  useEffect(() => {
    setSplits([])
    fetchSplits(personId, group)
      .then(setSplits)
      .catch(() => setSplits([]))
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
        role="dialog"
        aria-modal="true"
        aria-label={`${playerName} game log`}
        className="bg-panel-raised border-2 border-rule-heavy max-w-3xl w-full max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky so the close button stays reachable — this panel scrolls
            through splits, a chart and ten game rows. Matches GameDetailModal. */}
        <div className="sticky top-0 bg-panel z-10 flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <img
              src={playerHeadshotUrl(personId)}
              alt={playerName}
              className="w-10 h-10 rounded-full object-cover bg-gray-100 shrink-0"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
            <h2 className="font-semibold text-gray-900">{playerName}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close game log"
            className="text-gray-500 hover:text-gray-700 text-xl leading-none px-3 py-2 -mr-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-phillies-red/40"
          >
            &times;
          </button>
        </div>
        <div className="p-4">
          {/* Season line — comes from the table row, so it renders immediately. */}
          {group === 'hitting'
            ? (() => {
                const s = seasonStat as BattingStats
                return (
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-3 mb-5">
                    <StatTile label="AVG" value={s.avg} />
                    <StatTile label="OBP" value={s.obp} />
                    <StatTile label="SLG" value={s.slg} />
                    <StatTile label="OPS" value={s.ops} />
                    <StatTile label="HR" value={s.homeRuns} />
                    <StatTile label="RBI" value={s.rbi} />
                    <StatTile label="SB" value={s.stolenBases} />
                  </div>
                )
              })()
            : (() => {
                const s = seasonStat as PitchingStats
                return (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-5">
                    <StatTile label="ERA" value={s.era} />
                    <StatTile label="W-L" value={`${s.wins}-${s.losses}`} />
                    <StatTile label="IP" value={s.inningsPitched} />
                    <StatTile label="K" value={s.strikeOuts} />
                    <StatTile label="WHIP" value={s.whip} />
                    <StatTile label="SV" value={s.saves} />
                  </div>
                )
              })()}

          {/* Situational splits — independent of the game-log fetch. */}
          {orderedSplits.length > 0 && (
            <div className="mb-5">
              <div className="text-xs font-medium uppercase text-gray-500 mb-1">Splits</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="text-gray-500 text-xs uppercase">
                      <th className="text-left font-medium py-2">Split</th>
                      {group === 'hitting' ? (
                        <>
                          <th className="text-center font-medium py-2">AVG</th>
                          <th className="text-center font-medium py-2">OBP</th>
                          <th className="text-center font-medium py-2">SLG</th>
                          <th className="text-center font-medium py-2">OPS</th>
                          <th className="text-center font-medium py-2">HR</th>
                          <th className="text-center font-medium py-2">RBI</th>
                        </>
                      ) : (
                        <>
                          <th className="text-center font-medium py-2">AVG</th>
                          <th className="text-center font-medium py-2">WHIP</th>
                          <th className="text-center font-medium py-2">IP</th>
                          <th className="text-center font-medium py-2">K</th>
                          <th className="text-center font-medium py-2">BB</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orderedSplits.map(sp => (
                      <tr key={sp.split.code}>
                        <td className="py-2 text-gray-700 whitespace-nowrap font-medium">
                          {SPLIT_LABELS[group][sp.split.code] ?? sp.split.description}
                        </td>
                        {group === 'hitting'
                          ? (() => {
                              const s = sp.stat as BattingStats
                              return (
                                <>
                                  <td className="text-center tabular-nums">{s.avg}</td>
                                  <td className="text-center tabular-nums">{s.obp}</td>
                                  <td className="text-center tabular-nums">{s.slg}</td>
                                  <td className="text-center tabular-nums">{s.ops}</td>
                                  <td className="text-center tabular-nums">{s.homeRuns}</td>
                                  <td className="text-center tabular-nums">{s.rbi}</td>
                                </>
                              )
                            })()
                          : (() => {
                              const s = sp.stat as PitchingStats
                              return (
                                <>
                                  <td className="text-center tabular-nums">{s.avg}</td>
                                  <td className="text-center tabular-nums">{s.whip}</td>
                                  <td className="text-center tabular-nums">{s.inningsPitched}</td>
                                  <td className="text-center tabular-nums">{s.strikeOuts}</td>
                                  <td className="text-center tabular-nums">{s.baseOnBalls}</td>
                                </>
                              )
                            })()}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {loading && <div className="text-center text-gray-500 py-6">Loading…</div>}
          {error && <div className="text-center text-red-600 py-6">{error}</div>}
          {!loading && !error && (
            <div className="mb-4">
              <div className="flex gap-2 mb-2">
                {stats.map((s, i) => (
                  <button
                    key={s.label}
                    type="button"
                    // The selected state was colour-only; aria-pressed gives it a
                    // programmatic equivalent.
                    aria-pressed={i === statIndex}
                    onClick={() => setStatIndex(i)}
                    className={
                      'text-xs font-medium rounded-full px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-phillies-red/40 ' +
                      (i === statIndex
                        ? 'bg-phillies-red text-white'
                        : 'text-gray-600 border border-gray-300 hover:border-gray-400')
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {trendPoints.length >= 2 ? (
                <TrendChart
                  points={trendPoints}
                  yFormat={stats[statIndex].format}
                  label={`${playerName} ${stats[statIndex].label}`}
                />
              ) : (
                <div className="text-center text-gray-500 text-sm py-8">Not enough games yet.</div>
              )}
            </div>
          )}
          {!loading && !error && (
            <div className="text-xs font-medium uppercase text-gray-500 mb-1">Last 10 Games</div>
          )}
          {!loading && !error && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
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
                      <td colSpan={group === 'hitting' ? 9 : 8} className="text-center text-gray-500 py-6">
                        No recent games.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
