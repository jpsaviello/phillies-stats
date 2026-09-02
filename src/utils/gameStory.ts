// Pure logic behind GameDetailModal's Game Story sections. No React, no fetch —
// same posture as bullpen.ts / playoffPush.ts / tiebreakers.ts, so every
// function here can be replayed against saved statsapi JSON with no browser and
// no dev server.

import type { GameBoxscore, WinProbEntry } from '../api/mlb'
import type { BattedBall, HitData, WinProbPoint } from '../types/mlb'

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
