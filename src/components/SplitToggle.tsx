import { navigate } from '../hooks/useRoute'

interface Props {
  /** The view currently showing — read from the route by the parent. */
  split: 'post' | null
}

const OPTIONS: { value: 'post' | null; label: string }[] = [
  { value: null, label: 'Regular season' },
  { value: 'post', label: 'Postseason' },
]

/**
 * Regular season · Postseason, over the Batting and Pitching tables.
 *
 * Two real buttons with `aria-pressed` rather than a styled checkbox: the two
 * states are peers, not on/off, and each label says exactly what the table will
 * show. The choice goes through the router, so the view is linkable and Back
 * returns to the previous one.
 */
export default function SplitToggle({ split }: Props) {
  return (
    <div
      role="group"
      aria-label="Which games"
      className="inline-flex shrink-0 self-start overflow-hidden rounded-lg border border-gray-300 text-sm font-medium"
    >
      {OPTIONS.map(({ value, label }, i) => {
        const active = split === value
        return (
          <button
            key={label}
            type="button"
            aria-pressed={active}
            onClick={() => navigate({ split: value })}
            className={`px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-phillies-red/40 ${
              i > 0 ? 'border-l border-gray-300' : ''
            } ${active ? 'bg-hover text-live' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
