// Pure workload-tracking logic for the BullpenUsage panel. No fetching, no
// Date.now() — `today` is always an argument so callers control ET resolution
// (see easternToday in date.ts) and this stays testable. See the bullpen-usage
// design spec for why this exists and what it deliberately does NOT compute
// (availability, leverage, anything predictive).

import type { BullpenBoxscore } from '../api/mlb'
import type { BullpenOuting, PitcherWorkload, RosterEntry } from '../types/mlb'
import { daysBehind } from './date'
import { inningsToOuts } from './innings'

/** How many trailing calendar days count toward the "N of last 4" flag. */
const FREQUENCY_WINDOW_DAYS = 4
const FREQUENCY_THRESHOLD = 3
const HEAVY_PITCH_COUNT = 40
/** Season gamesStarted/gamesPlayed at or above this ratio classifies a starter. */
const STARTER_RATIO = 0.5

export interface RawAppearance extends BullpenOuting {
  playerId: number
  name: string
}

/**
 * One game's boxscore -> that team's pitchers' appearances. Reads `pitchers[]`
 * for order (reliable, unlike object key order) and looks each one up in
 * `players`. A team with no boxscore side for `teamId` (shouldn't happen for a
 * completed game, but a malformed response is possible) yields [].
 */
export function extractTeamPitchers(box: BullpenBoxscore, teamId: number, gamePk: number, date: string): RawAppearance[] {
  const teams = box.liveData.boxscore?.teams
  const side = teams?.home?.team.id === teamId ? teams.home : teams?.away?.team.id === teamId ? teams.away : undefined
  if (!side) return []

  const appearances: RawAppearance[] = []
  for (const pid of side.pitchers) {
    const player = side.players[`ID${pid}`]
    if (!player) continue
    const p = player.stats.pitching
    appearances.push({
      playerId: pid,
      name: player.person.fullName,
      gamePk,
      date,
      pitches: p.pitchesThrown ?? 0,
      inningsPitched: p.inningsPitched ?? '0.0',
      battersFaced: p.battersFaced ?? 0,
      earnedRuns: p.earnedRuns ?? 0,
      strikeOuts: p.strikeOuts ?? 0,
      baseOnBalls: p.baseOnBalls ?? 0,
      hits: p.hits ?? 0,
      inheritedRunners: p.inheritedRunners ?? 0,
      wasStart: p.gamesStarted === 1,
    })
  }
  return appearances
}

interface SeasonRoleInput {
  playerId: number
  gamesStarted: number
  gamesPlayed: number
}

/**
 * Season-long role, not a per-game fact. Prefers season splits
 * (gamesStarted/gamesPlayed >= 0.5); a pitcher absent from season splits (data
 * not loaded yet, or a September call-up) falls back to whether any outing in
 * the window itself was a start. See design spec decision 2 for why the roster
 * response alone can't answer this — every active pitcher there is just "P".
 */
function classifyRole(playerId: number, seasonRoles: Map<number, SeasonRoleInput>, windowOutings: BullpenOuting[]): 'reliever' | 'starter' {
  const season = seasonRoles.get(playerId)
  if (season && season.gamesPlayed > 0) {
    return season.gamesStarted / season.gamesPlayed >= STARTER_RATIO ? 'starter' : 'reliever'
  }
  return windowOutings.some(o => o.wasStart) ? 'starter' : 'reliever'
}

/**
 * Descriptive-only flags about what happened, never a prediction about what
 * happens next (design spec decision 1). Streak flags dedupe against the
 * frequency flag when they describe the same thing.
 */
export function workloadFlags(outings: BullpenOuting[], today: string): string[] {
  if (outings.length === 0) return []

  const byDateDesc = [...outings].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const flags: string[] = []

  // Longest run of consecutive calendar days ending at the most recent outing.
  let streak = 1
  for (let i = 1; i < byDateDesc.length; i++) {
    const gap = daysBehind(byDateDesc[i].date, byDateDesc[i - 1].date)
    if (gap === 1) {
      streak++
    } else {
      break
    }
  }
  if (streak === 2) {
    flags.push('back-to-back')
  } else if (streak >= 3) {
    flags.push(`${streak} straight days`)
  }

  const frequencyCount = outings.filter(o => daysBehind(o.date, today) < FREQUENCY_WINDOW_DAYS).length
  // Skip when the streak flag already says the same thing (every day in the
  // streak falls inside the frequency window whenever streak >= frequencyCount).
  if (frequencyCount >= FREQUENCY_THRESHOLD && frequencyCount > streak) {
    flags.push(`${frequencyCount} of last ${FREQUENCY_WINDOW_DAYS} days`)
  }

  const last = byDateDesc[0]
  if (last.pitches >= HEAVY_PITCH_COUNT) {
    flags.push(`${last.pitches}+ pitches last outing`)
  }

  return flags
}

/**
 * Appearances across a window of games -> one row per pitcher, including
 * active-roster pitchers who didn't appear at all (they're the genuinely fresh
 * arms, and omitting them would invert the panel's meaning).
 */
export function buildWorkloads(
  appearances: RawAppearance[],
  roster: RosterEntry[],
  seasonSplits: { player: { id: number }; stat: { gamesStarted: number; gamesPlayed: number } }[],
  today: string
): PitcherWorkload[] {
  const seasonRoles = new Map<number, SeasonRoleInput>()
  for (const s of seasonSplits) {
    seasonRoles.set(s.player.id, { playerId: s.player.id, gamesStarted: s.stat.gamesStarted, gamesPlayed: s.stat.gamesPlayed })
  }

  const byPlayer = new Map<number, RawAppearance[]>()
  for (const a of appearances) {
    const list = byPlayer.get(a.playerId) ?? []
    list.push(a)
    byPlayer.set(a.playerId, list)
  }

  const names = new Map<number, string>()
  for (const a of appearances) names.set(a.playerId, a.name)
  for (const r of roster) {
    if (r.position.type !== 'Pitcher') continue
    if (!byPlayer.has(r.person.id)) byPlayer.set(r.person.id, [])
    if (!names.has(r.person.id)) names.set(r.person.id, r.person.fullName)
  }

  const workloads: PitcherWorkload[] = []
  for (const [playerId, outings] of byPlayer) {
    const sorted = [...outings].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    const totalOuts = outings.reduce((sum, o) => sum + inningsToOuts(o.inningsPitched), 0)
    workloads.push({
      playerId,
      name: names.get(playerId) ?? `Player ${playerId}`,
      role: classifyRole(playerId, seasonRoles, outings),
      outings: sorted,
      totalPitches: outings.reduce((sum, o) => sum + o.pitches, 0),
      totalOuts,
      daysSinceLast: sorted.length > 0 ? daysBehind(sorted[0].date, today) : null,
      flags: workloadFlags(outings, today),
    })
  }
  return workloads
}

/** Most-recently-used first; pitchers with no outings in the window sort last. */
export function sortByRecency(list: PitcherWorkload[]): PitcherWorkload[] {
  return [...list].sort((a, b) => {
    const av = a.daysSinceLast ?? Infinity
    const bv = b.daysSinceLast ?? Infinity
    return av - bv
  })
}
