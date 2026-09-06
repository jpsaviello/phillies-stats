import { useEffect, useState } from 'react'
import { invalidate, oldestServableAt } from '../utils/cache'
import { formatAge } from '../utils/freshness'

/**
 * How often the label re-reads the clock. The figure is only ever shown to the
 * minute, so anything faster redraws to say the same thing.
 */
const TICK_MS = 20_000

/**
 * How old the data on screen could be, and the way to force fresh data.
 *
 * **The refresh control is the point, not decoration.** The request cache
 * persists into `sessionStorage`, so pressing the browser's own reload restores
 * the same values rather than refetching them — before this, a reader had no
 * way at all to make the app go back to MLB short of closing the tab. That is
 * also why the button reloads the page after invalidating: every tab component
 * owns its own fetch lifecycle and there is no global refetch signal to send,
 * so clearing both cache layers and reloading is the honest way to guarantee
 * the next paint came from the network. The hash router makes that free — the
 * active tab and any open modal live in the URL, so a reload returns to the
 * same view.
 *
 * The age quoted is an UPPER BOUND (see `oldestServableAt`), not the age of any
 * one figure. It is labelled "as of" rather than "updated" for that reason.
 *
 * Self-hides until the cache holds something, matching the convention every
 * other panel in this app follows.
 */
export default function DataFreshness() {
  const [at, setAt] = useState<number | null>(() => oldestServableAt())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => {
      setAt(oldestServableAt())
      setNow(Date.now())
    }, TICK_MS)
    return () => clearInterval(id)
  }, [])

  // The first paint happens before any fetch resolves, so the cache is empty on
  // mount and the initial read above returns null. A short follow-up read picks
  // the value up once the tab's requests land, without waiting a full tick.
  useEffect(() => {
    if (at !== null) return
    const id = setTimeout(() => setAt(oldestServableAt()), 1_200)
    return () => clearTimeout(id)
  }, [at])

  if (at === null) return null

  const age = now - at
  function refresh() {
    invalidate()
    window.location.reload()
  }

  return (
    <button
      type="button"
      onClick={refresh}
      aria-label={`Data as of ${formatAge(age)}. Refresh.`}
      title={`Data as of ${formatAge(age)}. Refresh.`}
      className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-rule px-2.5 text-gray-600 transition-colors hover:border-rule-heavy hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-phillies-red/40"
    >
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16.5 8.5a6.6 6.6 0 1 0 .3 3.4" />
        <path d="M16.9 3.9v4.6h-4.6" />
      </svg>
      <span className="text-xs tabular-nums">as of {formatAge(age)}</span>
    </button>
  )
}
