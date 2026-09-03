import { describe, expect, it } from 'vitest'
import type { TeamStatSplit } from '../rankings'
import { HITTING_CATEGORIES, PITCHING_CATEGORIES, rankCategories } from '../rankings'

const PHILLIES = 143

function splits(rows: [number, Record<string, string | number>][]): TeamStatSplit[] {
  return rows.map(([id, stat]) => ({ team: { id, name: `Team ${id}` }, stat }))
}

describe('rankCategories', () => {
  it('ranks high-is-better categories from the top', () => {
    const ranked = rankCategories(
      splits([[PHILLIES, { runs: 604 }], [110, { runs: 700 }], [121, { runs: 500 }]]),
      PHILLIES,
      [{ key: 'runs', label: 'Runs', higherIsBetter: true }]
    )
    expect(ranked?.[0]).toMatchObject({ rank: 2, of: 3, value: '604' })
  })

  it('ranks low-is-better categories from the bottom', () => {
    // Getting this backwards renders a first-place staff as last, and the
    // output looks entirely plausible either way — hence a test per direction.
    const ranked = rankCategories(
      splits([[PHILLIES, { era: '3.71' }], [110, { era: '4.20' }], [121, { era: '3.10' }]]),
      PHILLIES,
      [{ key: 'era', label: 'ERA', higherIsBetter: false }]
    )
    expect(ranked?.[0]).toMatchObject({ rank: 2, of: 3 })
  })

  it('gives tied clubs the better rank and skips the next (1, 2, 2, 4)', () => {
    // Standard competition ranking. Breaking a genuine tie by team id is the
    // thing MLB's own standings endpoint does, and the reason tiebreakers.ts
    // exists — inventing a placement here would repeat that mistake.
    const rows = splits([
      [PHILLIES, { homeRuns: 200 }],
      [110, { homeRuns: 220 }],
      [121, { homeRuns: 200 }],
      [120, { homeRuns: 150 }],
    ])
    const category = [{ key: 'homeRuns', label: 'HR', higherIsBetter: true }]
    expect(rankCategories(rows, PHILLIES, category)?.[0].rank).toBe(2)
    expect(rankCategories(rows, 121, category)?.[0].rank).toBe(2)
    expect(rankCategories(rows, 120, category)?.[0].rank).toBe(4)
  })

  it('preserves MLB formatting so a rate stays a rate', () => {
    // ".260" must not come back as "0.26".
    const ranked = rankCategories(
      splits([[PHILLIES, { avg: '.260' }], [110, { avg: '.245' }]]),
      PHILLIES,
      [{ key: 'avg', label: 'AVG', higherIsBetter: true }]
    )
    expect(ranked?.[0].value).toBe('.260')
  })

  it('handles numbers and strings in the same stat object', () => {
    const ranked = rankCategories(
      splits([[PHILLIES, { runs: 604, era: '3.71' }], [110, { runs: 700, era: '4.20' }]]),
      PHILLIES,
      [
        { key: 'runs', label: 'Runs', higherIsBetter: true },
        { key: 'era', label: 'ERA', higherIsBetter: false },
      ]
    )
    expect(ranked?.map(r => r.rank)).toEqual([2, 1])
  })

  it('drops a category the response carried no usable number for', () => {
    // ".---" is the empty-sample form; ranking it as zero would report a
    // first-place finish the club did not earn.
    const ranked = rankCategories(
      splits([[PHILLIES, { avg: '.---', runs: 604 }], [110, { avg: '.245', runs: 700 }]]),
      PHILLIES,
      [
        { key: 'avg', label: 'AVG', higherIsBetter: true },
        { key: 'runs', label: 'Runs', higherIsBetter: true },
      ]
    )
    expect(ranked?.map(r => r.key)).toEqual(['runs'])
  })

  it('counts only the clubs that reported a value', () => {
    const ranked = rankCategories(
      splits([[PHILLIES, { runs: 604 }], [110, { runs: 700 }], [121, {}]]),
      PHILLIES,
      [{ key: 'runs', label: 'Runs', higherIsBetter: true }]
    )
    expect(ranked?.[0].of).toBe(2)
  })

  it('returns null when the club is absent from the splits', () => {
    expect(rankCategories(splits([[110, { runs: 700 }]]), PHILLIES, HITTING_CATEGORIES)).toBeNull()
  })
})

describe('category tables', () => {
  it('marks strikeouts good-low on offense and good-high on the mound', () => {
    // The same key means opposite things depending on which side of the ball it
    // sits on, which is exactly why higherIsBetter is a required field.
    expect(HITTING_CATEGORIES.find(c => c.key === 'strikeOuts')?.higherIsBetter).toBe(false)
    expect(PITCHING_CATEGORIES.find(c => c.key === 'strikeOuts')?.higherIsBetter).toBe(true)
  })

  it('states a direction for every category', () => {
    for (const category of [...HITTING_CATEGORIES, ...PITCHING_CATEGORIES]) {
      expect(typeof category.higherIsBetter).toBe('boolean')
    }
  })
})
