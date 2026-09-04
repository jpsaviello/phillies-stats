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
  // First, and the default route — the day's game before the season's tables.
  { id: 'today', label: 'Today' },
  { id: 'batting', label: 'Batting' },
  { id: 'pitching', label: 'Pitching' },
  { id: 'roster', label: 'Roster' },
  { id: 'standings', label: 'Standings' },
  { id: 'schedule', label: 'Schedule' },
]

export default function Nav({ active, onChange, hidden = [] }: NavProps) {
  const visible = tabs.filter(t => !hidden.includes(t.id))
  return (
    // The masthead's last row, and its closing rule. Heavy, because this is
    // the boundary between the chrome and the tab's own content — and it has
    // to keep reading as that boundary once it sticks and detaches.
    <nav className="bg-panel border-b-2 border-rule-heavy sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 flex overflow-x-auto">
        {visible.map(tab => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              // Active state was conveyed by colour and a border alone.
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onChange(tab.id)}
              className={`group relative shrink-0 whitespace-nowrap px-3 sm:px-5 py-3 font-display text-sm sm:text-base font-semibold uppercase tracking-[0.08em] transition-colors ${
                isActive ? 'text-mark' : 'text-gray-500 hover:text-mark'
              }`}
            >
              {tab.label}
              {/* The one authored motion moment in the app: the active tab's
                  rule draws in from the left rather than cutting on, which
                  confirms the navigation the reader just made. Keyed on the
                  tab id so it replays per selection, and it starts from a
                  visible resting state — reduced-motion drops the animation,
                  never the rule. */}
              {isActive && (
                <span
                  key={tab.id}
                  aria-hidden="true"
                  className="rule-draw absolute inset-x-0 bottom-0 h-[3px] bg-phillies-red"
                />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export type { Tab }
