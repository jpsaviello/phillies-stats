// MLB writes innings pitched in a notation that is NOT decimal: "6.1" means six
// innings plus one out, and "6.2" is six plus two — there is no ".3". So
// parseFloat("6.2") + parseFloat("6.2") = 12.4, an inning count that cannot
// exist. Anything that adds or formats innings has to go through outs.

/** "6.1" -> 19 outs. Tolerates a bare "6" and a missing/garbage value (-> 0). */
export function inningsToOuts(ip: string | undefined): number {
  if (!ip) return 0
  const [whole, thirds] = ip.split('.')
  const innings = Number(whole)
  if (!Number.isFinite(innings)) return 0
  // A stray ".3"+ would silently roll an extra inning; clamp instead.
  const extra = Math.min(Number(thirds ?? 0) || 0, 2)
  return innings * 3 + extra
}

/** 19 outs -> "6.1", the same notation MLB uses. */
export function outsToInnings(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

/**
 * Fractional innings, for rate math like ERA where a continuous value is what's
 * wanted. Never use this to sum innings for *display* — round-tripping the
 * result back to MLB notation reintroduces the .1/.2 problem.
 */
export function inningsToFloat(ip: string | undefined): number {
  return inningsToOuts(ip) / 3
}

/** Earned-run average over an arbitrary span. Nine innings is 27 outs. */
export function eraOver(earnedRuns: number, outs: number): string {
  if (outs === 0) return '—'
  return ((earnedRuns * 27) / outs).toFixed(2)
}
