type Tab = 'batting' | 'pitching' | 'standings' | 'schedule'

interface NavProps {
  active: Tab
  onChange: (tab: Tab) => void
}

const tabs: { id: Tab; label: string }[] = [
  { id: 'batting', label: 'Batting' },
  { id: 'pitching', label: 'Pitching' },
  { id: 'standings', label: 'Standings' },
  { id: 'schedule', label: 'Schedule' },
]

export default function Nav({ active, onChange }: NavProps) {
  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 flex gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              active === tab.id
                ? 'border-[#E81828] text-[#E81828]'
                : 'border-transparent text-gray-600 hover:text-gray-900'
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
