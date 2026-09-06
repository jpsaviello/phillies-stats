/**
 * How the data-freshness indicator words an age.
 *
 * Coarse on purpose. The figure is an upper bound on staleness, not a
 * measurement, so a to-the-second readout would dress an approximation up as
 * precision — the same reason this app shows no playoff probability. Under a
 * minute reads as "just now" rather than counting seconds nobody is timing.
 */
export function formatAge(ms: number): string {
  if (ms < 0) return 'just now'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}
