import { describe, expect, it } from 'vitest'
import { formatAge } from '../freshness'

const MIN = 60_000

describe('formatAge', () => {
  it('says "just now" below a minute rather than counting seconds', () => {
    expect(formatAge(0)).toBe('just now')
    expect(formatAge(59_999)).toBe('just now')
  })

  it('floors to whole minutes', () => {
    expect(formatAge(MIN)).toBe('1m ago')
    expect(formatAge(4 * MIN + 59_000)).toBe('4m ago')
    expect(formatAge(59 * MIN)).toBe('59m ago')
  })

  it('steps to hours at the hour', () => {
    expect(formatAge(60 * MIN)).toBe('1h ago')
    expect(formatAge(150 * MIN)).toBe('2h ago')
  })

  // Clock skew between the cache's timestamp and the render tick can make an
  // age momentarily negative; it must not render "-1m ago".
  it('treats a negative age as just now', () => {
    expect(formatAge(-5_000)).toBe('just now')
  })
})
