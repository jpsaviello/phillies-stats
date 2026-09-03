import { useEffect, useState } from 'react'
import { daysBehind, easternToday } from '../utils/date'

/**
 * Reads one of the routine-written static files under public/ — briefing.json,
 * on-this-day.json — and hands back its content, or null.
 *
 * Both cards had their own byte-identical copy of this: same no-cache fetch,
 * same shape guard, same staleness cutoff, same swallow-everything catch. It
 * lives here now so the merged Today in Phils module can hold two entries
 * without holding two copies of the logic.
 *
 * Everything failure-shaped resolves to null — a missing file, a 404, malformed
 * JSON, the wrong shape, or content too old. These cards are supplementary to
 * the tabs below them, so the right answer to any of that is to render nothing
 * rather than an error or an empty shell.
 */

/**
 * Content older than this is dropped rather than presented as today's, so a
 * skipped or failed routine run degrades to an absent card instead of week-old
 * copy passed off as news.
 */
export const MAX_AGE_DAYS = 2

export function useStoryCard<T extends { date: string }>(
  path: string,
  isValid: (data: unknown) => data is T
): T | null {
  const [content, setContent] = useState<T | null>(null)

  useEffect(() => {
    let current = true
    // no-cache revalidates on every load, so the morning push isn't masked by
    // a cached copy of yesterday's file.
    fetch(path, { cache: 'no-cache' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`${path} ${res.status}`))))
      .then((data: unknown) => {
        if (!current || !isValid(data)) return
        // Measured against `date` — the ET day the routine wrote the file for.
        // Never against on-this-day's `historicalDate`, which is decades old by
        // design and would hide the card every single time.
        if (daysBehind(data.date, easternToday()) > MAX_AGE_DAYS) return
        setContent(data)
      })
      .catch(() => {
        if (current) setContent(null)
      })
    return () => {
      current = false
    }
    // isValid is a module-scope type guard at every call site, so it is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  return content
}
