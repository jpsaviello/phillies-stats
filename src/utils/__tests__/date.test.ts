import { describe, expect, it } from 'vitest'
import { baseballDay, daysBehind, easternToday, formatDate, shiftDate } from '../date'

// The runner's TZ is pinned to America/Los_Angeles (vitest.config.ts), so a
// regression to local-timezone math fails here instead of passing by luck on a
// machine that happens to sit in ET.
describe('easternToday', () => {
  it('returns an ISO calendar date', () => {
    expect(easternToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('follows Eastern Time rather than the machine timezone', () => {
    // 04:30 UTC is Sept 4 in ET (00:30 EDT) but still Sept 3 in PT (21:30 PDT).
    // The runner sits in PT, so local-timezone math returns Sept 3 here — this
    // is the west-coast fan who must still be shown the Eastern baseball day.
    expect(baseballDay(new Date('2026-09-04T04:30:00Z'))).toBe('2026-09-04')
  })

  it('follows Eastern Time rather than UTC', () => {
    // 02:00 UTC is already Sept 4 in UTC but only 22:00 on Sept 3 in ET — a
    // night game still in progress. Naive UTC math rolls the day over early and
    // drops the live game out of a query for "today".
    expect(baseballDay(new Date('2026-09-04T02:00:00Z'))).toBe('2026-09-03')
  })

  it('tracks the daylight-saving offset rather than a fixed one', () => {
    // 04:30 UTC in January is 23:30 on the previous day in EST (UTC-5), where
    // the same instant in July would already be the next day in EDT (UTC-4).
    expect(baseballDay(new Date('2026-01-15T04:30:00Z'))).toBe('2026-01-14')
    expect(baseballDay(new Date('2026-07-15T04:30:00Z'))).toBe('2026-07-15')
  })
})

describe('daysBehind', () => {
  it('counts whole calendar days between two ISO dates', () => {
    expect(daysBehind('2026-09-01', '2026-09-03')).toBe(2)
    expect(daysBehind('2026-09-03', '2026-09-03')).toBe(0)
  })

  it('goes negative for a date in the future', () => {
    expect(daysBehind('2026-09-05', '2026-09-03')).toBe(-2)
  })

  it('spans a month boundary', () => {
    expect(daysBehind('2026-08-30', '2026-09-02')).toBe(3)
  })

  it('reports Infinity for garbage rather than NaN', () => {
    // Callers compare against a staleness cutoff; NaN would fail every
    // comparison and silently render stale content as fresh.
    expect(daysBehind('not-a-date', '2026-09-03')).toBe(Infinity)
  })
})

describe('shiftDate', () => {
  it('does pure calendar arithmetic', () => {
    expect(shiftDate('2026-09-03', -7)).toBe('2026-08-27')
    expect(shiftDate('2026-09-03', 1)).toBe('2026-09-04')
  })

  it('crosses a year boundary', () => {
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('handles a leap day', () => {
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('formatDate', () => {
  it('stays on the intended day west of UTC', () => {
    // A bare YYYY-MM-DD parses as UTC midnight, which is the previous day in
    // every US timezone — the noon anchor is what prevents "Sep 2" here.
    expect(formatDate('2026-09-03', { month: 'short', day: 'numeric' })).toBe('Sep 3')
  })
})
