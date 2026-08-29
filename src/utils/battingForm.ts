// Pure form-tracking logic for the Hot & Cold panel. No fetching and no
// Date.now() — the caller supplies both the window line and the season line, so
// this stays a plain function of its inputs.
//
// What this deliberately does NOT do, for the same reason BullpenUsage reports
// workload rather than availability and PlayoffPush shows no playoff
// probability: it makes no claim about what a hitter will do next. A 15-day OPS
// is a small sample and everyone in baseball knows it; the panel's job is to
// state the measured line and its distance from the player's own season
// baseline, both of which a reader could recompute by hand.

import type { BattingStats, HitterForm, Player, WindowBattingStats } from '../types/mlb'

/**
 * Plate appearances required in the window before a hitter gets a row.
 *
 * This is a signal gate, not a fairness rule. Below it the panel fills with
 * pitchers who took one at-bat and September call-ups with three, every one of
 * them rendered as a .000 or 1.000 hitter — noise that crowds out the eight
 * regulars the panel exists to describe.
 */
export const MIN_PLATE_APPEARANCES = 10

/**
 * OPS points away from a player's season line before the window is called
 * heating up or cooling off. Stated in the panel's footnote, because an
 * unexplained threshold is indistinguishable from a verdict.
 */
export const TREND_THRESHOLD = 0.1

/**
 * MLB sends rate stats as strings — ".286", "1.171", and for an empty sample
 * ".---". parseFloat turns that last one into NaN, so every caller has to check;
 * this returns null instead so the check happens once, here.
 */
export function parseRate(value: string | undefined): number | null {
  if (value === undefined) return null
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : null
}

/** Season OPS by player id, for the baseline each window line is measured against. */
function seasonOpsById(seasonSplits: { player: Player; stat: BattingStats }[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const s of seasonSplits) {
    const ops = parseRate(s.stat.ops)
    if (ops !== null) map.set(s.player.id, ops)
  }
  return map
}

/**
 * Window splits + season splits -> one row per qualified hitter, sorted by
 * window OPS descending.
 *
 * `seasonSplits` is routinely still empty on the panel's first render (its own
 * request usually resolves before the table's), which is why the trend falls
 * back to 'unknown' rather than to 'steady': a hitter with no baseline yet is
 * not a hitter who is holding steady, and the panel renders him with a dash.
 */
export function buildForms(
  windowSplits: { player: Player; stat: WindowBattingStats }[],
  seasonSplits: { player: Player; stat: BattingStats }[]
): HitterForm[] {
  const baseline = seasonOpsById(seasonSplits)

  return windowSplits
    .filter(s => (s.stat.plateAppearances ?? 0) >= MIN_PLATE_APPEARANCES)
    .map(({ player, stat }) => {
      const windowOps = parseRate(stat.ops)
      const seasonOps = baseline.get(player.id) ?? null
      // Rounded to the three decimals OPS is published at, and rounded HERE
      // rather than at render time so the grouping and the printed number can
      // never disagree. Both sides are 3-decimal quantities, so their true
      // difference is one too — but in binary floating point .872 - .772 lands a
      // hair under .100, which put a row printed as "+.100" under "Holding
      // steady" while the footnote said .100 groups it as heating up.
      const opsDelta =
        windowOps !== null && seasonOps !== null ? Math.round((windowOps - seasonOps) * 1000) / 1000 : null

      return {
        playerId: player.id,
        name: player.fullName,
        games: stat.gamesPlayed,
        atBats: stat.atBats,
        hits: stat.hits,
        homeRuns: stat.homeRuns,
        rbi: stat.rbi,
        avg: stat.avg,
        ops: stat.ops,
        seasonOps,
        opsDelta,
        trend: trendOf(opsDelta),
      }
    })
    .sort((a, b) => (parseRate(b.ops) ?? 0) - (parseRate(a.ops) ?? 0))
}

function trendOf(opsDelta: number | null): HitterForm['trend'] {
  if (opsDelta === null) return 'unknown'
  if (opsDelta >= TREND_THRESHOLD) return 'hot'
  if (opsDelta <= -TREND_THRESHOLD) return 'cold'
  return 'steady'
}

/**
 * Baseball's own notation for a rate difference: a sign, then three decimals
 * with no leading zero (`+.243`, `−.187`). The minus is U+2212, matching the
 * digit width of tabular-nums so a column of deltas stays aligned.
 */
export function formatDelta(opsDelta: number | null): string | null {
  if (opsDelta === null) return null
  const sign = opsDelta < 0 ? '−' : '+'
  return `${sign}${Math.abs(opsDelta).toFixed(3).replace(/^0/, '')}`
}
