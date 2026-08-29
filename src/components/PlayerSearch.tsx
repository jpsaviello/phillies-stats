interface Props {
  value: string
  onChange: (value: string) => void
  /** Rows currently rendered, and the number that would render with no query. */
  shown: number
  total: number
  /** Accessible name for the field — "Search batters". */
  label: string
  placeholder: string
}

/**
 * The tables' filter box (Batting, Pitching, Roster).
 *
 * The query is the caller's component state, deliberately not a URL param.
 * Everything else view-defining in this app lives in the hash, but `navigate()`
 * pushes a history entry, so a per-keystroke `q` would push one entry per
 * character and Back would walk the search backwards a letter at a time — the
 * exact Back behaviour useRoute exists to fix.
 */
export default function PlayerSearch({ value, onChange, shown, total, label, placeholder }: Props) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <div className="relative w-full sm:max-w-xs">
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="9" cy="9" r="5.5" />
          <path d="M13.5 13.5L17.5 17.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          // Not type="search": WebKit draws its own cancel button, which would
          // sit next to the one below.
          inputMode="search"
          autoComplete="off"
          aria-label={label}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              // preventDefault first, or Safari also reverts the field itself.
              e.preventDefault()
              onChange('')
            }
          }}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-phillies-red focus:outline-none focus-visible:ring-2 focus-visible:ring-phillies-red/40"
        />
        {value !== '' && (
          <button
            type="button"
            aria-label="Clear search"
            title="Clear search"
            onClick={() => onChange('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 leading-none text-gray-400 transition-colors hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-phillies-red/40"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {/* Announced rather than silently changing under a screen reader. */}
      <span aria-live="polite" className="shrink-0 text-sm tabular-nums text-gray-500">
        {value !== '' ? `${shown} of ${total}` : ''}
      </span>
    </div>
  )
}
