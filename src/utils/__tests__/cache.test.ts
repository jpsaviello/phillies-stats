import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_CACHE, cached, invalidate, oldestServableAt } from '../cache'

// sessionStorage does not exist in the node runner. That is deliberate rather
// than stubbed: every access in cache.ts is wrapped to fail open to memory, so
// running without it exercises that path.

afterEach(() => {
  invalidate()
  vi.useRealTimers()
})

const MIN = 60_000

describe('oldestServableAt', () => {
  it('is null when nothing is cached', () => {
    expect(oldestServableAt()).toBeNull()
  })

  // The whole reason this reports the oldest rather than the newest: the live
  // strip refetches the schedule every 60s whenever a game might be on, so a
  // "last successful fetch" reading would say "just now" on every tab no matter
  // how old the table in front of the reader actually was.
  it('reports the OLDEST entry, not the most recent', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-06T12:00:00Z'))
    await cached('old', { ttl: 5 * MIN, maxStale: 25 * MIN }, () => Promise.resolve(1))

    vi.setSystemTime(new Date('2026-09-06T12:10:00Z'))
    await cached('new', { ttl: 5 * MIN, maxStale: 25 * MIN }, () => Promise.resolve(2))

    expect(oldestServableAt()).toBe(new Date('2026-09-06T12:00:00Z').getTime())
  })

  // An expired entry would be refetched from the network on its next read, so
  // it describes nothing the reader is currently looking at.
  it('ignores entries past ttl + maxStale', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-06T12:00:00Z'))
    await cached('short', { ttl: 1 * MIN, maxStale: 4 * MIN }, () => Promise.resolve(1))

    vi.setSystemTime(new Date('2026-09-06T12:20:00Z'))
    await cached('long', { ttl: 5 * MIN, maxStale: 25 * MIN }, () => Promise.resolve(2))

    // 'short' died at 12:05; only 'long' is still servable.
    expect(oldestServableAt()).toBe(new Date('2026-09-06T12:20:00Z').getTime())
  })

  // NO_CACHE is dedupe-only and never persisted, so a live-feed payload must
  // not register as stored data with an age.
  it('never counts a NO_CACHE entry', async () => {
    await cached('live', NO_CACHE, () => Promise.resolve('feed'))
    expect(oldestServableAt()).toBeNull()
  })

  it('is cleared by invalidate', async () => {
    await cached('stats', { ttl: 5 * MIN }, () => Promise.resolve(1))
    expect(oldestServableAt()).not.toBeNull()
    invalidate()
    expect(oldestServableAt()).toBeNull()
  })
})
