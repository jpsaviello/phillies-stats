import type { WinProbPoint } from '../types/mlb'
import { inningLabel, turningPoints } from '../utils/gameStory'

interface Props {
  points: WinProbPoint[]
  opponentName: string
}

const VIEW_W = 640
const VIEW_H = 190
const MARGIN = { top: 12, right: 14, bottom: 22, left: 34 }
const PLOT_W = VIEW_W - MARGIN.left - MARGIN.right
const PLOT_H = VIEW_H - MARGIN.top - MARGIN.bottom
const RED = '#E81828' // SVG attribute literal; canonical token is --color-phillies-red in src/index.css
const GRAY = 'var(--color-gray-400)'

function pct(v: number): string {
  return `${Math.round(v)}%`
}

function signed(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

/**
 * The game's win probability from the Phillies' perspective.
 *
 * `points` must already be normalized by toPhilliesProbability() — this
 * component never sees MLB's home-team framing and must not try to correct it.
 */
export default function WinProbabilityChart({ points, opponentName }: Props) {
  // Two points is the minimum that makes a line rather than a dot.
  if (points.length < 2) return null

  const swings = turningPoints(points)
  const swingIndex = new Set(swings.map(s => s.atBatIndex))

  const x = (i: number) => MARGIN.left + (i / (points.length - 1)) * PLOT_W
  const y = (v: number) => MARGIN.top + PLOT_H - (v / 100) * PLOT_H
  const mid = y(50)

  const coords = points.map((p, i) => ({ px: x(i), py: y(p.philliesWinProb), p }))
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.px},${c.py}`).join(' ')
  const first = coords[0]
  const last = coords[coords.length - 1]

  // Shade toward the 50% line rather than to the floor: the area above midline
  // reads as "Phillies ahead", which is the whole point of the graphic. Both
  // fills are clipped to their own half so they never bleed across it.
  const areaPath = `${linePath} L${last.px},${mid} L${first.px},${mid} Z`

  // Faint rule at the first at-bat of each new inning, so the curve is legible
  // as a game rather than as an anonymous sequence of at-bats.
  const inningStarts = points
    .map((p, i) => ({ i, inning: p.inning }))
    .filter((m, idx, arr) => idx > 0 && m.inning !== arr[idx - 1].inning)

  const finalProb = points[points.length - 1].philliesWinProb

  return (
    <section className="mt-6">
      <h3 className="font-display text-lg uppercase tracking-wide text-mark">Win Probability</h3>
      <p className="mt-0.5 text-xs text-gray-500">
        Phillies' chance to win, after every plate appearance.
      </p>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="mt-2 w-full"
        role="img"
        aria-label={
          `Phillies win probability across ${points.length} plate appearances versus ${opponentName}, ` +
          `starting at ${pct(points[0].philliesWinProb)} and ending at ${pct(finalProb)}. ` +
          `The biggest swings are listed below the chart.`
        }
      >
        <defs>
          <clipPath id="wp-above">
            <rect x={MARGIN.left} y={MARGIN.top} width={PLOT_W} height={mid - MARGIN.top} />
          </clipPath>
          <clipPath id="wp-below">
            <rect x={MARGIN.left} y={mid} width={PLOT_W} height={MARGIN.top + PLOT_H - mid} />
          </clipPath>
        </defs>

        {[0, 25, 50, 75, 100].map(t => (
          <g key={t}>
            <line
              x1={MARGIN.left}
              y1={y(t)}
              x2={MARGIN.left + PLOT_W}
              y2={y(t)}
              className={t === 50 ? 'stroke-gray-300' : 'stroke-gray-100'}
              strokeWidth="1"
            />
            <text x={MARGIN.left - 6} y={y(t) + 3} textAnchor="end" className="text-[10px] tabular-nums fill-gray-400">
              {t}
            </text>
          </g>
        ))}

        {inningStarts.map(m => (
          <line
            key={m.i}
            x1={x(m.i)}
            y1={MARGIN.top}
            x2={x(m.i)}
            y2={MARGIN.top + PLOT_H}
            className="stroke-gray-100"
            strokeWidth="1"
          />
        ))}

        <path d={areaPath} fill={RED} opacity="0.16" clipPath="url(#wp-above)" />
        <path d={areaPath} fill={GRAY} opacity="0.18" clipPath="url(#wp-below)" />
        <path
          d={linePath}
          fill="none"
          stroke={RED}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {coords
          .filter(c => swingIndex.has(c.p.atBatIndex))
          .map(c => (
            <circle key={c.p.atBatIndex} cx={c.px} cy={c.py} r="4" fill={RED} className="stroke-panel" strokeWidth="2" />
          ))}

        <text x={MARGIN.left} y={MARGIN.top + PLOT_H + 15} className="text-[10px] fill-gray-400">
          First pitch
        </text>
        <text
          x={MARGIN.left + PLOT_W}
          y={MARGIN.top + PLOT_H + 15}
          textAnchor="end"
          className="text-[10px] fill-gray-400"
        >
          Final
        </text>
      </svg>

      {swings.length > 0 && (
        <>
          <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Turning points</h4>
          <ul className="mt-1 space-y-1">
            {swings.map(s => (
              <li key={s.atBatIndex} className="flex gap-2 text-sm">
                <span className="w-14 shrink-0 tabular-nums text-gray-500">
                  {inningLabel(s.inning, s.halfInning)}
                </span>
                <span
                  className={`w-14 shrink-0 text-right tabular-nums font-semibold ${
                    s.added > 0 ? 'text-live' : 'text-gray-500'
                  }`}
                >
                  {signed(s.added)}
                </span>
                <span className="text-gray-700">{s.description}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
