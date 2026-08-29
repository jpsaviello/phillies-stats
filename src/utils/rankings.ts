// Pure ranking logic for the League Rankings panel. Takes the 30 team splits
// exactly as `/teams/stats` returns them and answers one question per category:
// where does this club sit, and out of how many.
//
// Ranks are computed here rather than read from the response's own `rank` field
// because that field is a single overall placement per team, not a per-category
// one — there is no "rank in home runs" anywhere in the payload.

/** One thing worth ranking a team by. */
export interface Category {
  /** Key into the split's `stat` object, as MLB names it. */
  key: string
  label: string
  /**
   * Which end of the list is good. ERA and strikeouts-at-the-plate are better
   * low; runs and OPS are better high. Getting this backwards would silently
   * report a first-place pitching staff as last, so every category states it.
   */
  higherIsBetter: boolean
}

export interface RankedCategory extends Category {
  /** Formatted exactly as MLB sent it, so ".732" stays ".732" and not "0.732". */
  value: string
  rank: number
  of: number
}

export interface TeamStatSplit {
  team: { id: number; name: string }
  stat: Record<string, string | number>
}

/**
 * MLB mixes numbers (runs: 604) and strings ("era": "3.71", avg: ".260") in the
 * same stat object. Number() handles both, including the leading-dot rates, and
 * returns NaN for the ".---" empty-sample form — reported as null so a missing
 * value drops its category rather than ranking as zero.
 */
function numeric(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Standard competition ranking: ties share the better rank and the next value
 * skips ahead (1, 2, 2, 4). Two clubs with an identical ERA are genuinely tied,
 * and breaking that by team id — the thing MLB's own standings endpoint does,
 * and the reason utils/tiebreakers.ts exists — would invent a placement.
 */
function rankOf(values: number[], value: number, higherIsBetter: boolean): number {
  const better = values.filter(v => (higherIsBetter ? v > value : v < value)).length
  return better + 1
}

/**
 * Team splits -> that team's placement in each category, skipping any category
 * the response didn't carry a usable number for.
 *
 * Returns null when the requested team isn't in the splits at all, which is the
 * panel's cue to render nothing rather than an empty card.
 */
export function rankCategories(
  splits: TeamStatSplit[],
  teamId: number,
  categories: Category[]
): RankedCategory[] | null {
  const own = splits.find(s => s.team.id === teamId)
  if (!own) return null

  const ranked: RankedCategory[] = []
  for (const category of categories) {
    const value = numeric(own.stat[category.key])
    if (value === null) continue

    const values = splits
      .map(s => numeric(s.stat[category.key]))
      .filter((v): v is number => v !== null)

    ranked.push({
      ...category,
      value: String(own.stat[category.key]),
      rank: rankOf(values, value, category.higherIsBetter),
      of: values.length,
    })
  }
  return ranked
}

/** The offense categories the panel shows, in the order it shows them. */
export const HITTING_CATEGORIES: Category[] = [
  { key: 'runs', label: 'Runs', higherIsBetter: true },
  { key: 'homeRuns', label: 'Home Runs', higherIsBetter: true },
  { key: 'avg', label: 'Batting Avg', higherIsBetter: true },
  { key: 'obp', label: 'On-Base', higherIsBetter: true },
  { key: 'slg', label: 'Slugging', higherIsBetter: true },
  { key: 'ops', label: 'OPS', higherIsBetter: true },
  { key: 'stolenBases', label: 'Stolen Bases', higherIsBetter: true },
  // The one hitting category where less is better — hence the flag on every row.
  { key: 'strikeOuts', label: 'Strikeouts', higherIsBetter: false },
]

/** The pitching categories, same idea. `avg` here is opponents' average. */
export const PITCHING_CATEGORIES: Category[] = [
  { key: 'era', label: 'ERA', higherIsBetter: false },
  { key: 'whip', label: 'WHIP', higherIsBetter: false },
  { key: 'strikeOuts', label: 'Strikeouts', higherIsBetter: true },
  { key: 'baseOnBalls', label: 'Walks', higherIsBetter: false },
  { key: 'avg', label: 'Opp. Avg', higherIsBetter: false },
  { key: 'homeRuns', label: 'HR Allowed', higherIsBetter: false },
  { key: 'runs', label: 'Runs Allowed', higherIsBetter: false },
  { key: 'saves', label: 'Saves', higherIsBetter: true },
]
