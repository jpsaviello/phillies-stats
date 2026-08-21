// Pure grouping/classification for the Roster tab. No React, no fetch — same
// posture as bullpen.ts / playoffPush.ts / tiebreakers.ts, so it can be replayed
// against real statsapi JSON without a browser or a dev server.

import type { BattingStats, PitchingStats, RosterPlayer } from '../types/mlb'

export type PositionGroup = 'C' | 'IF' | 'OF' | 'DH' | 'P'

export const POSITION_LABELS: Record<PositionGroup, string> = {
  C: 'Catchers',
  IF: 'Infielders',
  OF: 'Outfielders',
  DH: 'Designated Hitter',
  P: 'Pitchers',
}

// Scorecard order: up the middle, then the corners, then the mound.
const POSITION_ORDER: PositionGroup[] = ['C', 'IF', 'OF', 'DH', 'P']

export interface SeasonLine {
  group: 'hitting' | 'pitching'
  stat: BattingStats | PitchingStats
}

/**
 * The player's season line, or null when he has no 2026 appearances (five
 * players live today, including Johan Rojas — who is on the 60-day IL *and*
 * statless, so the IL section has to survive a fully blank row).
 *
 * Chooses the group by `stats[].group.displayName` and never by which keys are
 * present: a pitcher's hydrated stat object also carries avg/obp/slg/ops, which
 * are what he ALLOWED, so sniffing for `avg` would classify every pitcher as a
 * hitter.
 */
export function seasonLine(p: RosterPlayer): SeasonLine | null {
  for (const entry of p.person.stats ?? []) {
    const name = entry.group?.displayName
    if (name !== 'hitting' && name !== 'pitching') continue
    const stat = entry.splits?.[0]?.stat
    if (stat) return { group: name, stat }
  }
  return null
}

/**
 * `position.type` comes back as Pitcher / Catcher / Infielder / Outfielder /
 * Hitter. That last one is the DH (Schwarber today) and gets its own bucket —
 * folded into "Other" he'd silently vanish from a section that claims a count.
 */
export function positionGroup(p: RosterPlayer): PositionGroup {
  switch (p.position?.type) {
    case 'Pitcher':
      return 'P'
    case 'Catcher':
      return 'C'
    case 'Outfielder':
      return 'OF'
    case 'Hitter':
      return 'DH'
    default:
      return 'IF'
  }
}

// Blank jersey numbers sort last rather than to the front as 0 — five of the
// twelve minors players have none.
function jerseySortKey(n: string): number {
  const parsed = Number.parseInt(n, 10)
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed
}

function byPositionThenNumber(a: RosterPlayer, b: RosterPlayer): number {
  const pa = POSITION_ORDER.indexOf(positionGroup(a))
  const pb = POSITION_ORDER.indexOf(positionGroup(b))
  if (pa !== pb) return pa - pb
  const ja = jerseySortKey(a.jerseyNumber)
  const jb = jerseySortKey(b.jerseyNumber)
  if (ja !== jb) return ja - jb
  return a.person.fullName.localeCompare(b.person.fullName)
}

export interface RosterSubgroup {
  /** "Catchers" in the Active/Minors sections, "Injured 60-Day" in the IL one. */
  label: string
  players: RosterPlayer[]
}

export interface RosterSection {
  id: 'active' | 'injured' | 'minors'
  title: string
  subgroups: RosterSubgroup[]
  count: number
}

// Ascending severity, so a 10-day absence reads before a season-ending one.
const IL_ORDER = ['D10', 'D15', 'D60']

function isInjured(code: string): boolean {
  // Prefix match rather than an exact set: MLB has used other D-codes (D7 for
  // the old concussion list), and an unrecognised injury tier should still land
  // in the IL section rather than silently in Active.
  return /^D\d+$/.test(code)
}

function positionSubgroups(players: RosterPlayer[]): RosterSubgroup[] {
  const sorted = [...players].sort(byPositionThenNumber)
  return POSITION_ORDER.map(g => ({
    label: POSITION_LABELS[g],
    players: sorted.filter(p => positionGroup(p) === g),
  })).filter(s => s.players.length > 0)
}

/**
 * Three sections in fixed order — Active, Injured List, Minors.
 *
 * Status is the primary segmentation (who can play tonight / who is hurt / who
 * is in Lehigh Valley are three different questions); position is secondary. The
 * IL section keeps each player's SPECIFIC designation rather than collapsing to
 * one "IL" badge — the difference between a 10-day and a 60-day absence is the
 * only real information the API gives us about an injury.
 */
export function groupRoster(players: RosterPlayer[]): RosterSection[] {
  const active = players.filter(p => p.status?.code === 'A')
  const injured = players.filter(p => isInjured(p.status?.code ?? ''))
  // Everything that is neither active nor injured — Reassigned to Minors today,
  // but also where an unrecognised status lands so nobody is dropped silently.
  const other = players.filter(
    p => p.status?.code !== 'A' && !isInjured(p.status?.code ?? '')
  )

  const ilSubgroups = [...new Set(injured.map(p => p.status.description))]
    .sort((a, b) => {
      const ia = IL_ORDER.indexOf(injured.find(p => p.status.description === a)?.status.code ?? '')
      const ib = IL_ORDER.indexOf(injured.find(p => p.status.description === b)?.status.code ?? '')
      // Unknown tiers (-1) sort last rather than first.
      return (ia < 0 ? IL_ORDER.length : ia) - (ib < 0 ? IL_ORDER.length : ib)
    })
    .map(description => ({
      label: description,
      players: injured
        .filter(p => p.status.description === description)
        .sort(byPositionThenNumber),
    }))

  return [
    { id: 'active', title: 'Active Roster', subgroups: positionSubgroups(active), count: active.length },
    { id: 'injured', title: 'Injured List', subgroups: ilSubgroups, count: injured.length },
    { id: 'minors', title: 'Minors', subgroups: positionSubgroups(other), count: other.length },
  ].filter(s => s.count > 0) as RosterSection[]
}

/** "R/R", "S/R", or "—" when the API gave us neither side. */
export function handedness(p: RosterPlayer): string {
  const b = p.person.batSide?.code
  const t = p.person.pitchHand?.code
  if (!b && !t) return '—'
  return `${b ?? '?'}/${t ?? '?'}`
}

/**
 * The player's season line as one compact string.
 *
 * Deliberately one column rather than separate hitter/pitcher stat columns: the
 * IL section groups by injury tier, so `Injured 60-Day` holds Adolis García and
 * Brad Keller in the same subgroup. Shared column headers there would have to
 * label a hitter's AVG and a pitcher's W-L as the same thing, which is exactly
 * the kind of quiet dishonesty the rest of this app avoids. Per-row formatting
 * lets each line say what it actually is.
 */
export function formatSeasonLine(p: RosterPlayer): string | null {
  const line = seasonLine(p)
  if (!line) return null
  if (line.group === 'hitting') {
    const s = line.stat as BattingStats
    return `${s.avg} AVG · ${s.homeRuns} HR · ${s.rbi} RBI · ${s.ops} OPS`
  }
  const s = line.stat as PitchingStats
  return `${s.wins}-${s.losses} · ${s.era} ERA · ${s.gamesStarted} GS · ${s.strikeOuts} K`
}
