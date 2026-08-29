// Name matching for the tables' search boxes. No React, no fetch — same posture
// as roster.ts / bullpen.ts / tiebreakers.ts, so it can be exercised without a
// browser or a dev server.

/**
 * Lowercased, whitespace-collapsed, and — the load-bearing part — stripped of
 * diacritics.
 *
 * This roster carries Cristopher Sánchez, Ranger Suárez and José Alvarado. A
 * visitor types `sanchez` on a US keyboard, and a plain `includes()` returns
 * nothing, so the feature reads as broken on one of the first names anyone
 * tries. NFD splits `á` into `a` + a combining accent, which the strip then
 * removes.
 */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * True when every whitespace-separated token of `query` appears somewhere in
 * `name`.
 *
 * Token-AND rather than one whole-string substring: `kyle sch` matches
 * `Kyle Schwarber`, word order doesn't matter, and a stray double space is
 * harmless. An empty query matches everything, so callers can filter
 * unconditionally instead of branching.
 */
export function matchesQuery(name: string, query: string): boolean {
  const q = normalize(query)
  if (q === '') return true
  const haystack = normalize(name)
  return q.split(' ').every(token => haystack.includes(token))
}
