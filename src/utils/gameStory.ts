// Pure logic behind GameDetailModal's Game Story sections. No React, no fetch —
// same posture as bullpen.ts / playoffPush.ts / tiebreakers.ts, so every
// function here can be replayed against saved statsapi JSON with no browser and
// no dev server.

import type { GameBoxscore, HighlightItem, WinProbEntry } from '../api/mlb'
import type { BattedBall, HitData, HomeRunClip, WinProbPoint } from '../types/mlb'

/**
 * The batted-ball coordinate frame, derived from FIELDER POSITIONS rather than
 * from any distance figure. Averaging one game's 57 batted balls by their
 * `location` code pins it independently of the scale question below:
 *
 *   loc 2 (C)  -> (139.3, 202.9)   home plate sits near y=203
 *   loc 1 (P)  -> (129.8, 183.0)   the mound, 60'6" up from the plate
 *   loc 6 (SS) -> (107.1, 149.3)   symmetric about x~127,
 *   loc 4 (2B) -> (147.6, 151.5)   at equal depth
 *   loc 7 (LF) -> ( 83.5,  97.1)
 *   loc 8 (CF) -> (126.3,  83.6)   dead center confirms x~126 at the plate
 *   loc 9 (RF) -> (173.8, 104.0)
 *
 * So x grows toward RIGHT field and y DECREASES toward the outfield. Because
 * SVG's y also grows downward, coordY maps straight onto SVG y with no flip —
 * the outfield lands at the top of the viewBox for free.
 */
export const HOME_PLATE = { x: 126, y: 203 }

/**
 * Feet per coordinate unit, calibrated from the infield landmarks above (the
 * mound at 60'6" is ~20.6 units from the plate).
 *
 * DO NOT re-derive this from `totalDistance`, and never use totalDistance to
 * POSITION a dot. The two are not on a common scale: fitting against
 * totalDistance gives 2.15 ft/unit where the infield gives ~2.94, because the
 * coordinate records where a ball was FIELDED while totalDistance is Statcast's
 * projected flight — a fly ball caught on the run reads far shorter by
 * coordinate than by distance:
 *
 *   pred 367.1 ft vs actual 415.0  (fly ball, 27deg)
 *   pred 213.7 ft vs actual 161.0  (line drive, 19deg)
 *
 * coordinates position the dot; launchSpeed / launchAngle / totalDistance are
 * labels only.
 */
export const FT_PER_UNIT = 2.94

/**
 * The spray chart's drawing frame, in coordinate units.
 *
 * This is the SVG viewBox, and it lives here rather than in the component so it
 * can be tested against real coordinates without a browser.
 *
 * IT MUST CONTAIN THE WHOLE BATTED-BALL ENVELOPE, NOT THE FIELD. The frame was
 * previously sized to the fence (x 10..242, y 16..216) and silently CLIPPED
 * anything beyond it — a dot outside a viewBox is not drawn and reports no
 * error, so the ball simply was not there. Measured across 1,011 batted balls
 * in 20 games of the 2026 season, that frame dropped five: two home runs (one
 * at coordX 247.7, a 435-foot Schwarber shot to right) and three pop outs
 * behind the plate at coordY > 220.
 *
 * Observed envelope over that sample:
 *
 *   coordX  24.9 .. 247.7
 *   coordY  23.7 .. 222.0
 *
 * The bounds below clear that by more than a full MARKER radius on every side,
 * and are symmetric about HOME_PLATE.x so the diamond sits centred. Widen them,
 * never narrow them, if a ball ever lands outside.
 *
 * WIDENED 2026-09-06 from (-2, 12, 256, 216) when home runs gained their ring.
 * That frame cleared the envelope by one DOT radius, so the ring — 2.6 units
 * outside the dot — put the right edge of a 247.7 shot past the boundary and
 * clipped it into a crescent. The same silent failure the frame was widened for
 * the first time, one marker change later: anything that grows a marker has to
 * grow this too, which is what MAX_MARKER_RADIUS below exists to make checkable.
 */
export const SPRAY_FRAME = { minX: -6, minY: 10, width: 264, height: 222 }

/**
 * The furthest any drawn marker reaches from its coordinate: the largest dot
 * (SprayChart's R_MAX) plus the home-run ring drawn outside it. SPRAY_FRAME must
 * clear the batted-ball envelope by at least this much, and the unit tests
 * assert exactly that against the real extreme coordinates.
 */
export const MAX_MARKER_RADIUS = 6.8

/** True when a coordinate will actually be drawn inside SPRAY_FRAME. */
export function withinSprayFrame(x: number, y: number, radius = 0): boolean {
  return (
    x - radius >= SPRAY_FRAME.minX &&
    x + radius <= SPRAY_FRAME.minX + SPRAY_FRAME.width &&
    y - radius >= SPRAY_FRAME.minY &&
    y + radius <= SPRAY_FRAME.minY + SPRAY_FRAME.height
  )
}

/**
 * Normalize MLB's home-team win probability to the Phillies.
 *
 * This is the whole reason this function exists. MLB reports
 * `homeTeamWinProbability`, and the Phillies are the road club in half their
 * games — plotted raw, a road game's curve FALLS when they do well. The bug is
 * invisible on home games, so half of any test sample passes vacuously; verify
 * against a road game specifically.
 *
 * `homeTeamWinProbabilityAdded` is stated from the same perspective and needs
 * its sign flipped too, or the "biggest swings" list credits the wrong side.
 */
export function toPhilliesProbability(
  entries: WinProbEntry[],
  isPhilliesHome: boolean
): WinProbPoint[] {
  const points: WinProbPoint[] = []
  entries.forEach((e, i) => {
    const home = e.homeTeamWinProbability
    if (typeof home !== 'number') return
    const added = e.homeTeamWinProbabilityAdded
    points.push({
      atBatIndex: e.atBatIndex ?? i,
      inning: e.about?.inning ?? 0,
      halfInning: e.about?.halfInning ?? '',
      philliesWinProb: isPhilliesHome ? home : 100 - home,
      added: typeof added === 'number' ? (isPhilliesHome ? added : -added) : 0,
      description: e.result?.description ?? '',
    })
  })
  return points
}

/**
 * The n plays that swung the game most, returned in GAME order rather than
 * ranked order — the list reads as a narrative, not a leaderboard. Ties go to
 * the earlier at-bat.
 */
export function turningPoints(points: WinProbPoint[], n = 3): WinProbPoint[] {
  return [...points]
    .filter(p => p.added !== 0 && p.description !== '')
    .sort((a, b) => {
      const diff = Math.abs(b.added) - Math.abs(a.added)
      return diff !== 0 ? diff : a.atBatIndex - b.atBatIndex
    })
    .slice(0, n)
    .sort((a, b) => a.atBatIndex - b.atBatIndex)
}

function hasCoordinates(hit: HitData): boolean {
  return typeof hit.coordinates?.coordX === 'number' && typeof hit.coordinates?.coordY === 'number'
}

/**
 * Every batted ball in the game, flattened out of the play events.
 *
 * Balls with no coordinates are DROPPED rather than defaulted — a missing
 * coordinate defaulted to zero or to home plate would draw a phantom dot behind
 * the backstop and look like a real batted ball.
 *
 * Which side hit it comes from the half-inning and the home/away team ids, not
 * from a roster lookup: the away team bats in the top half, and that holds for
 * substitutes and callups a roster snapshot might not carry.
 */
export function battedBalls(box: GameBoxscore, philliesId: number): BattedBall[] {
  const isPhilliesHome = box.gameData?.teams?.home?.id === philliesId
  const out: BattedBall[] = []
  for (const play of box.liveData?.plays?.allPlays ?? []) {
    const batter = play.matchup?.batter
    if (!batter) continue
    const isTop = play.about?.isTopInning === true
    // Away bats in the top half; the Phillies hit in the half they aren't fielding.
    const philliesBatting = isPhilliesHome ? !isTop : isTop
    for (const event of play.playEvents ?? []) {
      const hit = event.hitData
      if (!hit || !hasCoordinates(hit)) continue
      out.push({
        batterId: batter.id,
        batterName: batter.fullName,
        event: play.result?.event ?? '',
        inning: play.about?.inning ?? 0,
        isTopInning: isTop,
        isPhillies: philliesBatting,
        playId: event.playId,
        hit,
      })
    }
  }
  return out
}

// Events that put the batter on base via a hit. Everything else — including
// walks, errors and fielder's choices — is drawn as an out, since the chart is
// about where the ball was struck, not how the scorer ruled the play.
const HIT_EVENTS = new Set(['Single', 'Double', 'Triple', 'Home Run'])

export function outcomeClass(event: string): 'hit' | 'out' {
  return HIT_EVENTS.has(event) ? 'hit' : 'out'
}

/** The hardest-hit balls, for the text summary under the spray chart. */
export function hardestHit(balls: BattedBall[], n = 2): BattedBall[] {
  return balls
    .filter(b => typeof b.hit.launchSpeed === 'number')
    .sort((a, b) => (b.hit.launchSpeed ?? 0) - (a.hit.launchSpeed ?? 0))
    .slice(0, n)
}

/** "Top 1st" / "Bot 9th" — compact enough for the turning-points list. */
export function inningLabel(inning: number, halfInning: string): string {
  const half = halfInning.toLowerCase().startsWith('top') ? 'Top' : 'Bot'
  const suffix = inning % 10 === 1 && inning !== 11 ? 'st'
    : inning % 10 === 2 && inning !== 12 ? 'nd'
    : inning % 10 === 3 && inning !== 13 ? 'rd'
    : 'th'
  return `${half} ${inning}${suffix}`
}

/**
 * Where a clip lives on MLB.com. The highlight item's `slug` is the whole path
 * segment — it is not derived from the headline, and often differs from it
 * ("Ronald Acuña Jr.'s solo home run (15)" is served at
 * /video/zack-wheeler-in-play-run-s-to-ronald-acuna-jr-x4055).
 */
const VIDEO_BASE = 'https://www.mlb.com/video/'

/**
 * MLB writes durations as "00:00:29". Trim the leading zero units so a
 * half-minute clip reads "0:29" rather than "00:00:29", and leave anything that
 * isn't in that shape alone rather than guessing at it.
 */
export function clipDuration(raw: string | undefined): string | null {
  if (!raw) return null
  const parts = raw.split(':')
  if (parts.length !== 3 || parts.some(part => !/^\d+$/.test(part))) return null
  const [h, m, sec] = parts.map(Number)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/**
 * Index a game's highlights by the play they were cut from.
 *
 * A highlight's `guid` IS the `playId` of its play event — that is the entire
 * join, and it holds across home and road games, both clubs, and every clip
 * type MLB cuts per-play. Items with no guid (the recap, the condensed game,
 * the "Data Viz" and "Field View" segments, which are edits of a play rather
 * than the play) are skipped: they would otherwise all collide on `undefined`
 * and hand an arbitrary one of them to the first home run asked about.
 *
 * FIRST WRITER WINS on a duplicate guid, so the ordering MLB returns — which
 * leads with the primary cut of each play — is preserved.
 */
export function indexClipsByPlayId(items: HighlightItem[]): Map<string, HighlightItem> {
  const byPlay = new Map<string, HighlightItem>()
  for (const item of items) {
    if (!item.guid || byPlay.has(item.guid)) continue
    byPlay.set(item.guid, item)
  }
  return byPlay
}

/** The smallest kept thumbnail, or null. The backend already narrows `cuts` to one. */
function thumbnailOf(item: HighlightItem | undefined): string | null {
  return item?.image?.cuts?.[0]?.src ?? null
}

/**
 * Every home run among `balls`, in game order, paired with its clip.
 *
 * Takes already-flattened batted balls rather than the raw feed so it inherits
 * the side split the spray chart is already showing — the caller passes the
 * Phillies' balls or the opponent's, and gets that club's home runs back.
 *
 * A home run with no matching clip still comes back, with nulls. Both cases are
 * normal: MLB may not have cut a play-linked clip (the Field of Dreams game),
 * and during a live game the clip lands minutes after the ball does.
 */
export function homeRunClips(
  balls: BattedBall[],
  clips: Map<string, HighlightItem>
): HomeRunClip[] {
  return balls
    .filter(ball => ball.event === 'Home Run')
    .map(ball => {
      const item = ball.playId ? clips.get(ball.playId) : undefined
      return {
        ball,
        url: item?.slug ? `${VIDEO_BASE}${item.slug}` : null,
        title: item?.title ?? item?.blurb ?? null,
        duration: clipDuration(item?.duration),
        thumbnailUrl: thumbnailOf(item),
      }
    })
}
