// The Tab union now lives with the router, since the URL is what holds the
// active tab. Re-exported below so existing `from './components/Nav'` imports
// keep working.
import type { Tab } from '../hooks/useRoute'

interface NavProps {
  active: Tab
  onChange: (tab: Tab) => void
  /**
   * Flag-gated tabs are removed from the bar entirely rather than rendered
   * inert: a visible tab whose panel is flagged off would click through to an
   * empty <main>, which is worse than the tab not existing.
   */
  hidden?: Tab[]
}

const tabs: { id: Tab; label: string }[] = [
  { id: 'batting', label: 'Batting' },
  { id: 'pitching', label: 'Pitching' },
  { id: 'roster', label: 'Roster' },
  { id: 'standings', label: 'Standings' },
  { id: 'schedule', label: 'Schedule' },
]

export default function Nav({ active, onChange, hidden = [] }: NavProps) {
  const visible = tabs.filter(t => !hidden.includes(t.id))
  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
        {visible.map(tab => (
          <button
            key={tab.id}
            // Active state was conveyed by colour and a border alone.
            aria-current={active === tab.id ? 'page' : undefined}
            onClick={() => onChange(tab.id)}
            className={`shrink-0 whitespace-nowrap px-3 sm:px-5 py-3 font-display text-sm sm:text-base font-semibold uppercase tracking-wide border-b-2 transition-colors ${
              active === tab.id
                ? 'border-phillies-red text-phillies-navy'
                : 'border-transparent text-gray-500 hover:text-phillies-navy'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

export type { Tab }
