import { describe, expect, it } from 'vitest'
import { matchesQuery, normalize } from '../search'

describe('normalize', () => {
  it('strips diacritics', () => {
    expect(normalize('Cristopher Sánchez')).toBe('cristopher sanchez')
    expect(normalize('Ranger Suárez')).toBe('ranger suarez')
    expect(normalize('José Alvarado')).toBe('jose alvarado')
  })

  it('collapses whitespace and trims', () => {
    expect(normalize('  Kyle   Schwarber  ')).toBe('kyle schwarber')
  })
})

describe('matchesQuery', () => {
  it('matches an accented name typed on a US keyboard', () => {
    // The load-bearing case: a plain includes() returns nothing here, and the
    // feature reads as broken on one of the first names anyone tries.
    expect(matchesQuery('Cristopher Sánchez', 'sanchez')).toBe(true)
    expect(matchesQuery('Ranger Suárez', 'suarez')).toBe(true)
  })

  it('still matches when the accent IS typed', () => {
    expect(matchesQuery('Cristopher Sánchez', 'Sánchez')).toBe(true)
  })

  it('ANDs the tokens, so word order does not matter', () => {
    expect(matchesQuery('Kyle Schwarber', 'kyle sch')).toBe(true)
    expect(matchesQuery('Kyle Schwarber', 'schwarber kyle')).toBe(true)
  })

  it('requires every token to appear', () => {
    expect(matchesQuery('Kyle Schwarber', 'kyle harper')).toBe(false)
  })

  it('matches everything on an empty or whitespace query', () => {
    // Callers filter unconditionally rather than branching on an empty box.
    expect(matchesQuery('Bryce Harper', '')).toBe(true)
    expect(matchesQuery('Bryce Harper', '   ')).toBe(true)
  })

  it('ignores case and stray double spaces', () => {
    expect(matchesQuery('Bryce Harper', 'BRYCE  harper')).toBe(true)
  })

  it('matches on a substring inside a name', () => {
    expect(matchesQuery('Trea Turner', 'urn')).toBe(true)
  })
})
