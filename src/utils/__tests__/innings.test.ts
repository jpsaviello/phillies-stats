import { describe, expect, it } from 'vitest'
import { eraOver, inningsToFloat, inningsToOuts, outsToInnings } from '../innings'

// The whole reason this module exists: MLB's innings notation is base-3 in the
// fractional digit, so anything that treats it as decimal is silently wrong.
describe('inningsToOuts', () => {
  it('reads the fractional digit as outs, not tenths', () => {
    expect(inningsToOuts('6.0')).toBe(18)
    expect(inningsToOuts('6.1')).toBe(19)
    expect(inningsToOuts('6.2')).toBe(20)
  })

  it('tolerates a bare inning count', () => {
    expect(inningsToOuts('7')).toBe(21)
  })

  it('treats missing or unparseable input as no work', () => {
    expect(inningsToOuts(undefined)).toBe(0)
    expect(inningsToOuts('')).toBe(0)
    expect(inningsToOuts('abc')).toBe(0)
  })

  it('clamps a nonsense .3+ rather than rolling an extra inning', () => {
    // ".3" is not a value MLB emits; if one ever appeared, silently promoting it
    // to 7.0 would overstate the workload it is used to measure.
    expect(inningsToOuts('6.3')).toBe(20)
  })
})

describe('outsToInnings', () => {
  it('round-trips MLB notation', () => {
    expect(outsToInnings(19)).toBe('6.1')
    expect(outsToInnings(18)).toBe('6.0')
    expect(outsToInnings(0)).toBe('0.0')
  })

  it('carries thirds into whole innings when summing outings', () => {
    // 5.2 + 5.2 is 11.1, NOT the 11.4 that float addition produces. This is the
    // exact case that made innings.ts the single source of truth.
    const outs = inningsToOuts('5.2') + inningsToOuts('5.2')
    expect(outsToInnings(outs)).toBe('11.1')
  })
})

describe('inningsToFloat', () => {
  it('gives a continuous value for rate math', () => {
    expect(inningsToFloat('6.1')).toBeCloseTo(6 + 1 / 3, 10)
  })
})

describe('eraOver', () => {
  it('computes earned runs per nine innings from outs', () => {
    // 3 earned runs over 9.0 innings is exactly 3.00.
    expect(eraOver(3, 27)).toBe('3.00')
    // 2 earned over 6.1 (19 outs) — averaging per-game ERAs would not give this.
    expect(eraOver(2, 19)).toBe('2.84')
  })

  it('renders a dash rather than dividing by zero', () => {
    expect(eraOver(0, 0)).toBe('—')
  })
})
