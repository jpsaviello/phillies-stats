import { useState } from 'react'
import type { BattedBall } from '../types/mlb'
import { FT_PER_UNIT, HOME_PLATE, hardestHit, outcomeClass } from '../utils/gameStory'

interface Props {
  balls: BattedBall[]
  opponentName: string
}

const RED = '#E81828' // SVG attribute literal; canonical token is --color-phillies-red in src/index.css
const OUT_GRAY = '#9ca3af'

// --- Infield: drawn from real distances, via the FT_PER_UNIT calibration that
// the mound and bases confirm (see gameStory.ts). ---
const u = (feet: number) => feet / FT_PER_UNIT
// Foul lines leave the plate at 45 degrees, so a landmark `feet` away sits that
// far along each axis divided by root two.
const diag = (feet: number) => u(feet) / Math.SQRT2

const FIRST_BASE = { x: HOME_PLATE.x + diag(90), y: HOME_PLATE.y - diag(90) }
const THIRD_BASE = { x: HOME_PLATE.x - diag(90), y: HOME_PLATE.y - diag(90) }
const SECOND_BASE = { x: HOME_PLATE.x, y: HOME_PLATE.y - u(127.3) }
const MOUND = { x: HOME_PLATE.x, y: HOME_PLATE.y - u(60.5) }

// --- Outfield: measured in COORDINATE UNITS, not converted from feet. ---
//
// The fence cannot be derived from a distance the way the infield can, because
// FT_PER_UNIT only holds near the plate — the same coordinate-vs-totalDistance
// mismatch documented in gameStory.ts. Deriving a 330-foot pole from it drew the
// fence at ~112 units and put ordinary doubles OUTSIDE the wall.
//
// So these come from the batted-ball envelope itself, measured across five 2026
// games (247 balls in play):
//
//   home runs        152.1 - 178.2 units from the plate (n=8)
//   deepest fly out  165.3
//   deepest grounder  75.0
//
// Poles just under the shortest home run, center just under the longest, which
// leaves the fence where it physically belongs: deep flies die in front of it,
// and a home run may legitimately land beyond it.
const POLE_U = 152
const CF_U = 178
const POLE_OFF = POLE_U / Math.SQRT2
const LF_POLE = { x: HOME_PLATE.x - POLE_OFF, y: HOME_PLATE.y - POLE_OFF }
const RF_POLE = { x: HOME_PLATE.x + POLE_OFF, y: HOME_PLATE.y - POLE_OFF }

// Cubic whose midpoint sits at straightaway-center depth, bulging the fence out
// from the two poles the way a real outfield does. The control points are what
// put the t=0.5 midpoint exactly at CF_U.
const CF_Y = HOME_PLATE.y - CF_U
const CTRL_Y = (8 * CF_Y - LF_POLE.y - RF_POLE.y) / 6
const FENCE =
  `M${LF_POLE.x.toFixed(1)},${LF_POLE.y.toFixed(1)} ` +
  `C${(LF_POLE.x + 34).toFixed(1)},${CTRL_Y.toFixed(1)} ` +
  `${(RF_POLE.x - 34).toFixed(1)},${CTRL_Y.toFixed(1)} ` +
  `${RF_POLE.x.toFixed(1)},${RF_POLE.y.toFixed(1)}`

// Exit velocity -> dot radius. The fallback is deliberately mid-scale rather
// than zero: 1 ball in 57 came back with no launchSpeed in the reference game,
// and a missing measurement must never become an invisible dot or a NaN radius.
const R_MIN = 1.6
const R_MAX = 4.2
const FALLBACK_R = 2.4
function radius(mph: number | undefined): number {
  if (typeof mph !== 'number') return FALLBACK_R
  const t = Math.min(Math.max((mph - 60) / 55, 0), 1)
  return R_MIN + t * (R_MAX - R_MIN)
}

function describe(b: BattedBall): string {
  const bits = [b.event]
  if (typeof b.hit.launchSpeed === 'number') bits.push(`${b.hit.launchSpeed.toFixed(0)} mph`)
  if (typeof b.hit.launchAngle === 'number') bits.push(`${b.hit.launchAngle.toFixed(0)}°`)
  if (typeof b.hit.totalDistance === 'number') bits.push(`${b.hit.totalDistance.toFixed(0)} ft`)
  return `${b.batterName} — ${bits.join(', ')}`
}

/**
 * Every batted ball placed on a field diagram.
 *
 * Dots are positioned from `hit.coordinates` ONLY. launchSpeed sizes a dot and
 * the measurements appear as labels, but distance never becomes geometry — the
 * coordinate and totalDistance are not on a common scale (gameStory.ts).
 */
export default function SprayChart({ balls, opponentName }: Props) {
  const [side, setSide] = useState<'phillies' | 'opponent'>('phillies')
  if (balls.length === 0) return null

  const shown = balls.filter(b => (side === 'phillies' ? b.isPhillies : !b.isPhillies))
  const hits = shown.filter(b => outcomeClass(b.event) === 'hit').length
  const sideLabel = side === 'phillies' ? 'Phillies' : opponentName

  const tabClass = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
      active ? 'bg-phillies-red text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg uppercase tracking-wide text-phillies-navy">Spray Chart</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Every ball put in play. Dot size is exit velocity.
          </p>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Choose which team's batted balls to show">
          <button type="button" onClick={() => setSide('phillies')} className={tabClass(side === 'phillies')} aria-pressed={side === 'phillies'}>
            Phillies
          </button>
          <button type="button" onClick={() => setSide('opponent')} className={tabClass(side === 'opponent')} aria-pressed={side === 'opponent'}>
            {opponentName}
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No batted balls recorded for {sideLabel}.</p>
      ) : (
        <>
          <svg
            viewBox="10 16 232 200"
            className="mt-3 w-full max-w-md"
            role="img"
            aria-label={
              `Spray chart of ${shown.length} batted balls by ${sideLabel}, ` +
              `${hits} of which went for hits. The hardest-hit balls are listed below.`
            }
          >
            <path d={`${FENCE} L${HOME_PLATE.x},${HOME_PLATE.y} Z`} fill="#f0fdf4" stroke="none" />
            <path d={FENCE} fill="none" stroke="#d1d5db" strokeWidth="1.2" />
            <line x1={HOME_PLATE.x} y1={HOME_PLATE.y} x2={LF_POLE.x} y2={LF_POLE.y} stroke="#d1d5db" strokeWidth="1" />
            <line x1={HOME_PLATE.x} y1={HOME_PLATE.y} x2={RF_POLE.x} y2={RF_POLE.y} stroke="#d1d5db" strokeWidth="1" />
            <path
              d={`M${HOME_PLATE.x},${HOME_PLATE.y} L${FIRST_BASE.x.toFixed(1)},${FIRST_BASE.y.toFixed(1)} L${SECOND_BASE.x},${SECOND_BASE.y.toFixed(1)} L${THIRD_BASE.x.toFixed(1)},${THIRD_BASE.y.toFixed(1)} Z`}
              fill="none"
              stroke="#d1d5db"
              strokeWidth="1"
            />
            <circle cx={MOUND.x} cy={MOUND.y} r="1.6" fill="#e5e7eb" />

            {shown.map((b, i) => {
              const c = b.hit.coordinates
              const isHit = outcomeClass(b.event) === 'hit'
              return (
                <circle
                  key={`${b.batterId}-${b.inning}-${i}`}
                  cx={c?.coordX}
                  cy={c?.coordY}
                  r={radius(b.hit.launchSpeed)}
                  fill={isHit ? RED : 'none'}
                  stroke={isHit ? '#fff' : OUT_GRAY}
                  strokeWidth={isHit ? 0.7 : 1}
                  opacity={isHit ? 0.9 : 0.75}
                >
                  <title>{describe(b)}</title>
                </circle>
              )
            })}
          </svg>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-phillies-red" /> Hit
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-gray-400" /> Out
            </span>
            <span>
              {shown.length} in play · {hits} {hits === 1 ? 'hit' : 'hits'}
            </span>
          </div>

          {hardestHit(shown).length > 0 && (
            <>
              <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Hardest hit</h4>
              <ul className="mt-1 space-y-1">
                {hardestHit(shown).map((b, i) => (
                  <li key={`${b.batterId}-${i}`} className="text-sm text-gray-700">
                    {describe(b)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}
