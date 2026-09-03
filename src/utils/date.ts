// The app's date vocabulary. Everything that needs to know "what day is it in
// baseball terms" comes through here rather than reaching for `new Date()`.

/**
 * The timezone the schedule is published in. Every date MLB sends — a game's
 * `officialDate`, a game log entry, the date a routine wrote a briefing for —
 * is an Eastern calendar date, so that is the only clock this app may measure
 * "today" against.
 */
const BASEBALL_TZ = 'America/New_York'

/**
 * The Eastern calendar date containing `at` — the "baseball day".
 *
 * This is the app's single definition of today, and it takes the instant as an
 * argument so it can be exercised without mocking the clock. Reaching for the
 * visitor's own timezone instead is wrong in both directions and quietly so: a
 * fan in Los Angeles at 9:30 PM is already on tomorrow's date in ET and would
 * be shown the wrong day's game, while one in London is a full day ahead for
 * most of their evening.
 *
 * en-CA gives YYYY-MM-DD, matching the format MLB's schedule endpoint takes and
 * the format the routine-written JSON files carry.
 */
export function baseballDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BASEBALL_TZ }).format(at)
}

/** Today's baseball day. Thin alias for the overwhelmingly common call. */
export function easternToday(): string {
  return baseballDay()
}

export function daysBehind(date: string, today: string): number {
  const then = Date.parse(`${date}T00:00:00Z`)
  const now = Date.parse(`${today}T00:00:00Z`)
  if (Number.isNaN(then) || Number.isNaN(now)) return Infinity
  return (now - then) / 86_400_000
}

// Noon anchor: a bare YYYY-MM-DD parses as UTC midnight, which is the previous
// day in every US timezone. Noon lands inside the intended day everywhere.
export function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', options)
}

// Pure calendar-date arithmetic (e.g. "7 days before today") via Date.UTC on
// the Y/M/D components — never the local timezone — so the result doesn't
// depend on where the browser happens to be running.
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
