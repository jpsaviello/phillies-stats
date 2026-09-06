import { useMemo, useState } from 'react'
import type { HighlightItem } from '../api/mlb'
import type { BattedBall, HomeRunClip } from '../types/mlb'
import {
  FENCE_PATH,
  FT_PER_UNIT,
  HOME_PLATE,
  LF_POLE,
  RF_POLE,
  SPRAY_FRAME,
  hardestHit,
  homeRunClips,
  inningLabel,
  outcomeClass,
} from '../utils/gameStory'

interface Props {
  balls: BattedBall[]
  opponentName: string
  /**
   * The game's highlights, indexed by the playId they were cut from. Empty
   * until the (separate, independently-failing) highlights fetch lands, and
   * empty forever if it failed — the home-run list renders either way, just
   * without links.
   */
  clips: Map<string, HighlightItem>
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

// --- Outfield: the fence lives in gameStory.ts, in COORDINATE UNITS. ---
//
// It is fit to outcomes rather than converted from feet, and it is over there
// rather than here so it can be checked against real coordinates with no
// browser — see FENCE_PATH's comment for the fit, the sample, and why a fence
// drawn from a distance in feet puts ordinary doubles outside the wall.

// Exit velocity -> dot radius. The fallback is deliberately mid-scale rather
// than zero: 1 ball in 57 came back with no launchSpeed in the reference game,
// and a missing measurement must never become an invisible dot or a NaN radius.
const R_MIN = 1.6
const R_MAX = 4.2
const FALLBACK_R = 2.4
// How far outside the dot the home-run ring is drawn. SPRAY_FRAME is sized to
// clear R_MAX + this on every side (gameStory.ts's MAX_MARKER_RADIUS); raising
// it without raising that clips the deepest home runs, which is exactly what it
// did the first time.
const HR_RING_GAP = 2.6
function radius(mph: number | undefined): number {
  if (typeof mph !== 'number') return FALLBACK_R
  const t = Math.min(Math.max((mph - 60) / 55, 0), 1)
  return R_MIN + t * (R_MAX - R_MIN)
}

function isHomeRun(b: BattedBall): boolean {
  return b.event === 'Home Run'
}

/** "435 ft · 108.7 mph", skipping whichever measurement is missing. */
function hrMeasurements(b: BattedBall): string {
  const bits: string[] = []
  if (typeof b.hit.totalDistance === 'number') bits.push(`${b.hit.totalDistance.toFixed(0)} ft`)
  if (typeof b.hit.launchSpeed === 'number') bits.push(`${b.hit.launchSpeed.toFixed(1)} mph`)
  return bits.join(' · ')
}

/**
 * One home run and, when MLB cut a play-linked clip for it, a link to the video.
 *
 * The whole row is the link rather than a trailing "Watch" word: at 375px a
 * two-word target beside a thumbnail is the kind of tap people miss, and the
 * row already reads as one object.
 *
 * A row with no clip renders as a plain div, never as a dead link — MLB has no
 * clip for roughly one home run in thirty, and during a live game the clip
 * arrives minutes after the ball does.
 */
function HomeRunRow({ clip }: { clip: HomeRunClip }) {
  const { ball } = clip
  const measurements = hrMeasurements(ball)
  const inning = inningLabel(ball.inning, ball.isTopInning ? 'top' : 'bottom')

  const body = (
    <>
      {clip.thumbnailUrl ? (
        <img
          src={clip.thumbnailUrl}
          alt=""
          loading="lazy"
          className="h-12 w-[85px] shrink-0 rounded-sm object-cover"
          // Same defence teamLogoUrl's <img> takes: a missing image must leave
          // the row intact rather than parking a broken-image glyph in it.
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-gray-900">{ball.batterName}</span>
        <span className="block truncate text-xs text-gray-500">
          {[inning, measurements].filter(Boolean).join(' · ')}
        </span>
      </span>
      {clip.url ? (
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-phillies-red">
          Watch
          {clip.duration && <span className="font-normal text-gray-500">{clip.duration}</span>}
          <span aria-hidden="true">&rsaquo;</span>
        </span>
      ) : (
        <span className="shrink-0 text-xs text-gray-500">No clip</span>
      )}
    </>
  )

  const shell = 'flex items-center gap-3 rounded-sm border border-rule px-2 py-2'
  if (!clip.url) return <li className={shell}>{body}</li>

  return (
    <li>
      <a
        href={clip.url}
        target="_blank"
        rel="noopener noreferrer"
        // bg-hover / border-rule-heavy are this app's clickable-row affordance
        // (BattingTable's rows, AuthWidget's bordered buttons); panel-raised
        // resolves to the panel colour in the light theme and would give a
        // hover that only exists in the dark one.
        className={`${shell} transition-colors hover:border-rule-heavy hover:bg-hover focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-phillies-red`}
        // The visible text is the batter's name; on its own that says nothing
        // about where the link goes or that it opens elsewhere.
        aria-label={`Watch ${clip.title ?? `${ball.batterName}'s home run`} on MLB.com (opens in a new tab)`}
      >
        {body}
      </a>
    </li>
  )
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
export default function SprayChart({ balls, opponentName, clips }: Props) {
  const [side, setSide] = useState<'phillies' | 'opponent'>('phillies')

  const shown = useMemo(
    () => balls.filter(b => (side === 'phillies' ? b.isPhillies : !b.isPhillies)),
    [balls, side]
  )
  // Recomputed when the clips arrive, not baked in at first render: the
  // highlights fetch resolves after the box score's, so a value computed once
  // would be permanently link-less. Same shape as BullpenUsage's classification
  // memo over its late-arriving seasonSplits prop.
  const homeRuns = useMemo(() => homeRunClips(shown, clips), [shown, clips])

  if (balls.length === 0) return null

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
              `${hits} of which went for hits` +
              (homeRuns.length > 0
                ? ` including ${homeRuns.length} ${homeRuns.length === 1 ? 'home run' : 'home runs'}`
                : '') +
              `. The home runs and hardest-hit balls are listed below.`
            }
          >
            <path d={`${FENCE_PATH} L${HOME_PLATE.x},${HOME_PLATE.y} Z`} className="fill-green-50" stroke="none" />
            <path d={FENCE_PATH} fill="none" className="stroke-gray-300" strokeWidth="1.2" />
            <line x1={HOME_PLATE.x} y1={HOME_PLATE.y} x2={LF_POLE.x} y2={LF_POLE.y} className="stroke-gray-300" strokeWidth="1" />
            <line x1={HOME_PLATE.x} y1={HOME_PLATE.y} x2={RF_POLE.x} y2={RF_POLE.y} className="stroke-gray-300" strokeWidth="1" />
            <path
              d={`M${HOME_PLATE.x},${HOME_PLATE.y} L${FIRST_BASE.x.toFixed(1)},${FIRST_BASE.y.toFixed(1)} L${SECOND_BASE.x},${SECOND_BASE.y.toFixed(1)} L${THIRD_BASE.x.toFixed(1)},${THIRD_BASE.y.toFixed(1)} Z`}
              fill="none"
              className="stroke-gray-300"
              strokeWidth="1"
            />
            <circle cx={MOUND.x} cy={MOUND.y} r="1.6" className="fill-gray-200" />

            {/* Home runs are drawn LAST so their rings sit above neighbouring
                dots rather than being cut by them — the deepest balls in a game
                often cluster, and a half-occluded ring reads as a smudge. */}
            {[...shown]
              .sort((a, b) => Number(isHomeRun(a)) - Number(isHomeRun(b)))
              .map((b, i) => {
                const c = b.hit.coordinates
                const isHit = outcomeClass(b.event) === 'hit'
                const r = radius(b.hit.launchSpeed)
                return (
                  <g key={`${b.batterId}-${b.inning}-${i}`}>
                    {isHomeRun(b) && (
                      // A concentric ring rather than a new colour: red already
                      // means "this is the high end of the measurement" in this
                      // app's scale, and a fourth marker colour would say
                      // something the scale doesn't.
                      <circle
                        cx={c?.coordX}
                        cy={c?.coordY}
                        r={r + HR_RING_GAP}
                        fill="none"
                        stroke={RED}
                        strokeWidth="0.9"
                        opacity="0.85"
                      />
                    )}
                    <circle
                      cx={c?.coordX}
                      cy={c?.coordY}
                      r={r}
                      fill={isHit ? RED : 'none'}
                      stroke={isHit ? 'var(--color-panel)' : OUT_GRAY}
                      strokeWidth={isHit ? 0.7 : 1}
                      opacity={isHit ? 0.9 : 0.75}
                    >
                      <title>{describe(b)}</title>
                    </circle>
                  </g>
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
            <span className="flex items-center gap-1.5">
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-phillies-red">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-phillies-red" />
              </span>
              Home run
            </span>
            <span>
              {shown.length} in play · {hits} {hits === 1 ? 'hit' : 'hits'}
            </span>
          </div>

          {homeRuns.length > 0 && (
            <>
              <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {homeRuns.length === 1 ? 'Home run' : `Home runs (${homeRuns.length})`}
              </h4>
              <ul className="mt-1.5 space-y-1.5">
                {homeRuns.map((clip, i) => (
                  <HomeRunRow key={clip.ball.playId ?? `${clip.ball.batterId}-${i}`} clip={clip} />
                ))}
              </ul>
            </>
          )}

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
