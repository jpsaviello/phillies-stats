/**
 * A tiny request cache for the read-only MLB endpoints.
 *
 * It exists for three separate problems that happened to have one fix.
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
 * The third is that a reload emptied all of it. `entries` is module scope, so a
 * refresh — or a back/forward that remounts the app — re-fetched every request
 * and showed skeletons for data that had been on screen a second earlier. Hence
 * the sessionStorage layer below.
 *
 * Deliberately NOT a data-fetching library. The components' existing
 * `useEffect` + `useState` + `.then` shape is untouched — this returns a plain
 * promise, so nothing above it had to change.
 *
 * INVARIANT: nothing user-specific may be routed through `cached()`. Values
 * reach a browser store now, so caching an authenticated response would persist
 * one signed-in user's data where the next one could read it. `fetchCurrentUser`,
 * `fetchFavorites` and `fetchProfile` all use a bare `fetch` for this reason and
 * must keep doing so.
 */

interface Entry {
  at: number
  value: unknown
}

const entries = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()

// The `v1` is cheap insurance against a future change to a cached payload's
// shape. Changes to a *request's* shape are already self-handling: keys embed
// the full path and query string, so adding a `fields=` parameter yields a
// different key rather than a stale hit.
const STORE_PREFIX = 'phl:cache:v1:'
const MAX_PERSISTED_BYTES = 512 * 1024

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

function restore(key: string): Entry | undefined {
  try {
    const raw = sessionStorage.getItem(STORE_PREFIX + key)
    if (raw === null) return undefined
    const parsed = JSON.parse(raw) as Entry
    // Guards a half-written value, or one written by an older shape of this file.
    if (typeof parsed?.at !== 'number') return undefined
    return parsed
  } catch {
    // Unreadable or unavailable storage is just a miss.
    return undefined
  }
}

function persist(key: string, entry: Entry, ttl: number) {
  // NO_CACHE (ttl 0) is dedupe-only, and it is what keeps LiveGameStrip honest —
  // its payload must never reach storage. `cached()` writes every success into
  // `entries` regardless of ttl (harmless in memory, since `age < ttl` can never
  // pass for ttl 0), so the guard has to live here rather than at the call site.
  if (ttl <= 0) return
  try {
    const json = JSON.stringify(entry)
    // A backstop, not a routine path: a typical MLB payload is ~40KB.
    if (json.length > MAX_PERSISTED_BYTES) return
    sessionStorage.setItem(STORE_PREFIX + key, json)
  } catch {
    // Out of quota, or storage unavailable (private mode, blocked site data).
    // Drop our own keys and carry on in memory only — the same fail-open idiom
    // AllStarBanner uses for its dismiss flag.
    try {
      clearPersisted()
    } catch {
      // Nothing further to do; the in-memory cache still works.
    }
  }
}

function clearPersisted(prefix?: string) {
  const match = STORE_PREFIX + (prefix ?? '')
  // Collected before removal: removing inside the loop reindexes
  // sessionStorage.key(i) and would skip every other match.
  const doomed: string[] = []
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (key !== null && key.startsWith(match)) doomed.push(key)
  }
  for (const key of doomed) sessionStorage.removeItem(key)
}

export function cached<T>(key: string, opts: CacheOptions, load: () => Promise<T>): Promise<T> {
  let hit = entries.get(key)
  // A reload empties `entries` but not sessionStorage. Restoring lazily here,
  // rather than bulk-hydrating at module load, means one stored payload is
  // parsed to serve one call. Everything below then runs unchanged: a restored
  // entry carries its original `at`, so staleness needs no special case.
  if (hit === undefined) {
    hit = restore(key)
    if (hit !== undefined) entries.set(key, hit)
  }
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
      const entry: Entry = { at: Date.now(), value }
      entries.set(key, entry)
      persist(key, entry, opts.ttl)
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

/**
 * Drops stored values so the next call goes to the network.
 *
 * Currently unused: the error states' "Try again" buttons bump a `reloadKey`,
 * and since only successes are ever stored, a failed fetch left nothing behind
 * to invalidate. Kept because it is the correct primitive the moment something
 * needs to force a refetch of data that *did* succeed.
 */
export function invalidate(prefix?: string) {
  // Storage has to be cleared too, or a retry button silently does nothing: it
  // would empty the Map, then the very next call would restore the same stale
  // value from sessionStorage.
  try {
    clearPersisted(prefix)
  } catch {
    // Storage unavailable; the in-memory clear below is what matters.
  }
  if (prefix === undefined) {
    entries.clear()
    return
  }
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key)
  }
}
