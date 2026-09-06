import { useState } from 'react'
import type { BattedBall } from '../types/mlb'
import { FT_PER_UNIT, HOME_PLATE, SPRAY_FRAME, hardestHit, outcomeClass } from '../utils/gameStory'

interface Props {
  balls: BattedBall[]
  opponentName: string
}

const RED = '#E81828' // SVG attribute literal; canonical token is --color-phillies-red in src/index.css
const OUT_GRAY = 'var(--color-gray-400)'

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
// These are FIT TO OUTCOMES over 1,011 batted balls in 20 games of the 2026
// season (37 home runs), not read off a tape measure.
//
// The first calibration used five games (n=8 home runs) and set the poles just
// under the SHORTEST home run seen and centre just under the LONGEST. On the
// wider sample that is far too deep: home runs actually run 143.2 - 192.7 units,
// and 152/178 drew 28 of 37 of them INSIDE the wall — a ball the list below
// calls a home run, plotted short of the fence it cleared.
//
// There is real overlap between the deepest outs and the shortest home runs,
// because a coordinate records where a ball was FIELDED: a catch at the track
// and a shot into the first row land a few units apart. So no fence separates
// them perfectly, and these were chosen by grid search to minimise misplacement,
// weighting a home run drawn inside the wall as the worse error since the text
// list names it:
//
//   152 / 178 (before)   28 of 37 home runs inside,  0 of 974 others beyond
//   130 / 174 (now)       3 of 37 home runs inside, 12 of 974 others beyond
//
// Re-fit these against fresh games rather than nudging them by eye.
const POLE_U = 130
const CF_U = 174
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
          <h3 className="font-display text-lg uppercase tracking-wide text-mark">Spray Chart</h3>
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
            // Sized to the batted-ball envelope, not to the fence — a dot
            // outside a viewBox is silently not drawn. See SPRAY_FRAME.
            viewBox={`${SPRAY_FRAME.minX} ${SPRAY_FRAME.minY} ${SPRAY_FRAME.width} ${SPRAY_FRAME.height}`}
            className="mt-3 w-full max-w-md"
            role="img"
            aria-label={
              `Spray chart of ${shown.length} batted balls by ${sideLabel}, ` +
              `${hits} of which went for hits. The hardest-hit balls are listed below.`
            }
          >
            <path d={`${FENCE} L${HOME_PLATE.x},${HOME_PLATE.y} Z`} className="fill-green-50" stroke="none" />
            <path d={FENCE} fill="none" className="stroke-gray-300" strokeWidth="1.2" />
            <line x1={HOME_PLATE.x} y1={HOME_PLATE.y} x2={LF_POLE.x} y2={LF_POLE.y} className="stroke-gray-300" strokeWidth="1" />
            <line x1={HOME_PLATE.x} y1={HOME_PLATE.y} x2={RF_POLE.x} y2={RF_POLE.y} className="stroke-gray-300" strokeWidth="1" />
            <path
              d={`M${HOME_PLATE.x},${HOME_PLATE.y} L${FIRST_BASE.x.toFixed(1)},${FIRST_BASE.y.toFixed(1)} L${SECOND_BASE.x},${SECOND_BASE.y.toFixed(1)} L${THIRD_BASE.x.toFixed(1)},${THIRD_BASE.y.toFixed(1)} Z`}
              fill="none"
              className="stroke-gray-300"
              strokeWidth="1"
            />
            <circle cx={MOUND.x} cy={MOUND.y} r="1.6" className="fill-gray-200" />

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
                  stroke={isHit ? 'var(--color-panel)' : OUT_GRAY}
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
