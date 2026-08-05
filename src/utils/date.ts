// Shared by the routine-fed cards (DailyBriefing, OnThisDayCard), which both
// measure a written-for date against today and render a formatted date label.

// Team-local date: a briefing written at 8 AM ET must not be measured against
// tomorrow's UTC date. en-CA gives YYYY-MM-DD, matching the JSON date format.
export function easternToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
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
