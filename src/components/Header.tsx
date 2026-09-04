import AuthWidget from './AuthWidget'
import { easternToday, formatDate } from '../utils/date'
import type { User } from '../types/auth'
import type { Profile } from '../types/profile'

interface HeaderProps {
  user: User | null
  onAuthChange: (user: User | null) => void
  profile: Profile | null
  onProfileChange: (profile: Profile) => void
}

export default function Header({ user, onAuthChange, profile, onProfileChange }: HeaderProps) {
  return (
    <header className="bg-phillies-navy bg-pinstripe text-white border-b-2 border-phillies-red">
      {/* Tighter on phones: the rest of the masthead's rows stack below this
          one, so every row saved here is a row closer to the stats. */}
      <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="bg-panel rounded-full p-1.5 shrink-0">
            <img
              src="https://www.mlbstatic.com/team-logos/143.svg"
              alt="Phillies"
              className="w-10 h-10"
            />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-wide leading-none truncate">
              Philadelphia Phillies
            </h1>
            {/* The scorecard's date line. Eastern, via the app's single
                definition of the baseball day — never the reader's clock,
                which west of ET still says yesterday during a night game. */}
            <p className="font-display text-blue-200 text-xs sm:text-sm uppercase tracking-[0.18em] mt-1 tabular">
              {formatDate(easternToday(), { weekday: 'long', month: 'long', day: 'numeric' })}
              <span className="hidden sm:inline"> · 2026 Season</span>
            </p>
          </div>
        </div>
        <AuthWidget
          user={user}
          onAuthChange={onAuthChange}
          profile={profile}
          onProfileChange={onProfileChange}
        />
      </div>
    </header>
  )
}
