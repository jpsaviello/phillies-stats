/**
 * A tiny request cache for the read-only MLB endpoints.
 *
 * It exists for two separate problems that happened to have one fix.
 *
 * The first is duplicate concurrent calls. Several components legitimately want
 * the same data on the same page load — `fetchBattingStats` alone is called by
 * HeroStrip (team leaders), FavoritesCard, and BattingTable — and each was
 * issuing its own identical request. Sharing the in-flight promise collapses
 * those to one without any of them having to know the others exist. Lifting the
 * fetches into a parent instead would have coupled components that are
 * deliberately independent (each self-hides on its own failure).
 *
 * The second is that every tab in App.tsx is an `&&` conditional, so switching
 * tabs unmounts the table and throws its data away. Coming back refetched from
 * scratch and showed a skeleton for data the browser had held moments earlier.
 *
 * Deliberately NOT a data-fetching library. The components' existing
 * `useEffect` + `useState` + `.then` shape is untouched — this returns a plain
 * promise, so nothing above it had to change.
 */

interface Entry {
  at: number
  value: unknown
}

const entries = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()

export interface CacheOptions {
  /** Below this age a cached value is served with no network call at all. */
  ttl: number
  /**
   * How far past `ttl` a value may still be served *while* a refresh runs in
   * the background. Past `ttl + maxStale` the caller waits for fresh data
   * instead — without this bound, a tab left open for hours would render an
   * hours-old value for one paint before the refresh landed.
   */
  maxStale?: number
}

/** Never serve a stored copy; only collapse concurrent callers. For anything live. */
export const NO_CACHE: CacheOptions = { ttl: 0 }

export function cached<T>(key: string, opts: CacheOptions, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key)
  const age = hit ? Date.now() - hit.at : Infinity

  if (hit && age < opts.ttl) return Promise.resolve(hit.value as T)

  // A second caller arriving while the first is still waiting joins it rather
  // than opening its own request.
  const shared = inflight.get(key) as Promise<T> | undefined
  if (shared) return shared

  const p = load()
    .then(value => {
      // Only successes are stored. A failed request leaves any previous value
      // in place, so a blip doesn't also destroy data we already had.
      entries.set(key, { at: Date.now(), value })
      return value
    })
    .finally(() => {
      // Guarded: a later call for the same key may already have replaced this
      // entry by the time an earlier one settles.
      if (inflight.get(key) === p) inflight.delete(key)
    })

  inflight.set(key, p)

  if (hit && age < opts.ttl + (opts.maxStale ?? 0)) {
    // Nobody is awaiting `p` on this path, so its rejection would surface as an
    // unhandled promise rejection in the console.
    p.catch(() => {})
    return Promise.resolve(hit.value as T)
  }

  return p
}

/** Drops stored values so the next call goes to the network. Used by retry buttons. */
export function invalidate(prefix?: string) {
  if (prefix === undefined) {
    entries.clear()
    return
  }
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key)
  }
}
