import { useState } from 'react'
import type { TrendPoint } from '../utils/trends'

interface Props {
  points: TrendPoint[]
  yFormat: (v: number) => string
  // Names the graphic for assistive tech; the chart is otherwise an unlabelled
  // role="img" and the trend is unavailable non-visually.
  label: string
}

const VIEW_W = 640
const VIEW_H = 200
const MARGIN = { top: 14, right: 56, bottom: 24, left: 44 }
const PLOT_W = VIEW_W - MARGIN.left - MARGIN.right
const PLOT_H = VIEW_H - MARGIN.top - MARGIN.bottom
const RED = '#E81828' // SVG attribute literal; canonical token is --color-phillies-red in src/index.css

function niceTicks(min: number, max: number): number[] {
  if (min === max) {
    min -= min === 0 ? 1 : Math.abs(min) * 0.1
    max += max === 0 ? 1 : Math.abs(max) * 0.1
  }
  const raw = (max - min) / 3
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag
  const lo = Math.floor(min / step) * step
  const ticks: number[] = []
  // Keep going until the top tick covers the data max, so the line never
  // escapes the plot area.
  for (let t = lo; ; t += step) {
    ticks.push(t)
    if (t >= max) break
  }
  return ticks
}

function monthLabel(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })
}

function dateLabel(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function TrendChart({ points, yFormat, label }: Props) {
  const [hover, setHover] = useState<number | null>(null)

  const ticks = niceTicks(
    Math.min(...points.map(p => p.value)),
    Math.max(...points.map(p => p.value))
  )
  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]

  const x = (i: number) => MARGIN.left + (points.length === 1 ? PLOT_W / 2 : (i / (points.length - 1)) * PLOT_W)
  const y = (v: number) => MARGIN.top + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H

  const coords = points.map((p, i) => ({ px: x(i), py: y(p.value) }))
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.px},${c.py}`).join(' ')
  const baseline = MARGIN.top + PLOT_H
  const areaPath = `${linePath} L${coords[coords.length - 1].px},${baseline} L${coords[0].px},${baseline} Z`

  // Month tick at the first point of each month present in the data. A short
  // partial first month (e.g. two late-March games) would crowd the next
  // label, so drop the earlier label — full months are never this close.
  const monthTicks = points
    .map((p, i) => ({ i, month: p.date.slice(0, 7) }))
    .filter((m, idx, arr) => idx === 0 || m.month !== arr[idx - 1].month)
  while (monthTicks.length >= 2 && x(monthTicks[1].i) - x(monthTicks[0].i) < 36) monthTicks.shift()

  const last = points[points.length - 1]
  const lastC = coords[coords.length - 1]

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const vx = MARGIN.left + ((e.clientX - rect.left) / rect.width) * PLOT_W
    let nearest = 0
    for (let i = 1; i < coords.length; i++) {
      if (Math.abs(coords[i].px - vx) < Math.abs(coords[nearest].px - vx)) nearest = i
    }
    setHover(nearest)
  }

  const tooltip = hover !== null && (() => {
    const c = coords[hover]
    const flip = c.px > MARGIN.left + PLOT_W / 2
    const tx = flip ? c.px - 8 : c.px + 8
    return (
      <g>
        <line x1={c.px} y1={MARGIN.top} x2={c.px} y2={baseline} stroke="#d1d5db" strokeWidth="1" />
        <circle cx={c.px} cy={c.py} r="5" fill={RED} stroke="#fff" strokeWidth="2" />
        <text
          x={tx}
          y={Math.max(c.py - 10, MARGIN.top + 10)}
          textAnchor={flip ? 'end' : 'start'}
          className="text-[12px] font-semibold"
          fill="#111827"
          stroke="#fff"
          strokeWidth="3"
          paintOrder="stroke"
        >
          {yFormat(points[hover].value)}
        </text>
        <text
          x={tx}
          y={Math.max(c.py - 10, MARGIN.top + 10) + 13}
          textAnchor={flip ? 'end' : 'start'}
          className="text-[10px]"
          fill="#6b7280"
          stroke="#fff"
          strokeWidth="3"
          paintOrder="stroke"
        >
          {dateLabel(points[hover].date)}
        </text>
      </g>
    )
  })()

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full"
      role="img"
      aria-label={`${label} trend over ${points.length} games, from ${yFormat(points[0].value)} on ${dateLabel(points[0].date)} to ${yFormat(last.value)} on ${dateLabel(last.date)}`}
    >
      {ticks.map(t => (
        <g key={t}>
          <line x1={MARGIN.left} y1={y(t)} x2={MARGIN.left + PLOT_W} y2={y(t)} stroke="#e5e7eb" strokeWidth="1" />
          <text x={MARGIN.left - 6} y={y(t) + 3} textAnchor="end" className="text-[10px] tabular-nums" fill="#9ca3af">
            {yFormat(t)}
          </text>
        </g>
      ))}
      {monthTicks.map(m => (
        <text key={m.month} x={x(m.i)} y={baseline + 16} textAnchor="middle" className="text-[10px]" fill="#9ca3af">
          {monthLabel(points[m.i].date)}
        </text>
      ))}
      <path d={areaPath} fill={RED} opacity="0.1" />
      <path d={linePath} fill="none" stroke={RED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {hover === null && (
        <>
          <circle cx={lastC.px} cy={lastC.py} r="4" fill={RED} stroke="#fff" strokeWidth="2" />
          <text x={lastC.px + 8} y={lastC.py + 4} className="text-[12px] font-semibold" fill="#374151">
            {yFormat(last.value)}
          </text>
        </>
      )}
      {tooltip}
      <rect
        x={MARGIN.left}
        y={MARGIN.top}
        width={PLOT_W}
        height={PLOT_H}
        fill="transparent"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      />
    </svg>
  )
}
