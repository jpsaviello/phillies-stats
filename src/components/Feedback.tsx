// Shared loading / empty / error presentation for the tab-level views.
//
// Before this, every tab rendered a single centered line of gray text while
// loading, so switching tabs collapsed the content area to one line and then
// expanded to a full table — a hard layout shift on every visit. HeroStrip was
// the only component that reserved its height with a skeleton; these mirror
// that treatment so the rest of the app behaves the same way.

interface TableSkeletonProps {
  rows?: number
  cols?: number
}

function Bars({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: cols }, (_, i) => (
        // The first column is the name/team column in every table here, so it
        // gets the wider bar.
        <div key={i} className={`h-3 rounded bg-gray-200 ${i === 0 ? 'flex-[2]' : 'flex-1'}`} />
      ))}
    </>
  )
}

export function TableSkeleton({ rows = 10, cols = 6 }: TableSkeletonProps) {
  return (
    <div role="status" className="animate-pulse">
      <span className="sr-only">Loading…</span>
      <div className="flex items-center gap-3 rounded-t-lg bg-gray-50 px-4 py-3.5" aria-hidden="true">
        <Bars cols={cols} />
      </div>
      <div className="divide-y divide-gray-100" aria-hidden="true">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-3 px-4 py-3.5">
            <Bars cols={cols} />
          </div>
        ))}
      </div>
    </div>
  )
}

interface ErrorStateProps {
  message: string
  onRetry: () => void
}

// The raw fetch message ("Failed to fetch") was previously shown to fans, and
// nothing in the app offered a way to try again.
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="p-8 text-center">
      <p className="text-gray-700">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-mark transition-colors hover:border-phillies-red hover:text-live focus:outline-none focus-visible:ring-2 focus-visible:ring-phillies-red/40"
      >
        Try again
      </button>
    </div>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="p-8 text-center text-gray-500">{children}</div>
}

// The search boxes' "nothing matched" state. Distinct from EmptyState: that one
// means the data itself is empty (no at-bats recorded yet), which the reader can
// do nothing about, while this one is a filter the reader can clear from here.
export function NoMatches({ query, onClear, noun }: { query: string; onClear: () => void; noun: string }) {
  return (
    <div className="p-8 text-center">
      <p className="text-gray-500">
        No {noun} match “{query}”.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-mark transition-colors hover:border-phillies-red hover:text-live focus:outline-none focus-visible:ring-2 focus-visible:ring-phillies-red/40"
      >
        Clear search
      </button>
    </div>
  )
}
