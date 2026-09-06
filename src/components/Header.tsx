import AuthWidget from './AuthWidget'
import ThemeToggle from './ThemeToggle'
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
    <header className="bg-instrument border-b border-phillies-red">
      {/* Tighter on phones: the rest of the masthead's rows stack below this
          one, so every row saved here is a row closer to the stats. */}
      <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {/* Bare on the instrument bar. The mark is a red script "P" and
              reads cleanly on the dark ground, so the light disc it used to sit
              on was chrome the lockup did not need. */}
          <div className="shrink-0">
            <img
              src="https://www.mlbstatic.com/team-logos/143.svg"
              alt="Phillies"
              className="w-10 h-10"
            />
          </div>
          <div className="min-w-0">
            {/* Stacked on a phone rather than shrunk or clipped. The logo and
                the sign-in control leave ~210px at 375px, and "PHILADELPHIA
                PHILLIES" set on one line needs more than that in any size worth
                calling a masthead — the previous fix shrank it until it fit,
                and the wider face this world uses broke that again. Two lines
                keeps the type from truncating, which is what a masthead is
                for. It steps down to text-xl below `sm`: the theme control
                takes ~46px of this row, and at text-2xl "PHILADELPHIA"
                overflowed its box by 18px and printed over that control.
                MEASURE `h1.scrollWidth - h1.clientWidth` at 375px after any
                change here — there is no `truncate` to hide a mistake. */}
            <h1 className="font-display text-xl sm:text-3xl font-bold uppercase tracking-[0.01em] sm:tracking-wide leading-[1.1] sm:leading-none text-gray-900">
              <span className="block sm:inline">Philadelphia</span>{' '}
              <span className="block sm:inline">Phillies</span>
            </h1>
            {/* The scorecard's date line. Eastern, via the app's single
                definition of the baseball day — never the reader's clock,
                which west of ET still says yesterday during a night game. */}
            {/* Tracking steps with the face: 0.18em on a phone pushed the date
                onto a second line in Archivo. */}
            <p className="font-display text-gray-500 text-[11px] sm:text-sm uppercase tracking-[0.06em] sm:tracking-[0.18em] mt-1 tabular whitespace-nowrap">
              {formatDate(easternToday(), { weekday: 'long', month: 'long', day: 'numeric' })}
              <span className="hidden sm:inline"> · 2026 Season</span>
            </p>
          </div>
        </div>
        {/* Which way the ink runs, beside the account control.
            MEASURE BEFORE ADDING A THIRD CONTROL HERE. At 375px this row holds
            the logo, the two-line club name and ~118px of controls with about
            12px to spare; a freshness chip was tried here and pushed the
            masthead into the buttons — the name overflowed its box and printed
            on top of them. That is why the data-freshness control lives in the
            footer instead, next to the attribution it belongs with. */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <AuthWidget
            user={user}
            onAuthChange={onAuthChange}
            profile={profile}
            onProfileChange={onProfileChange}
          />
        </div>
      </div>
    </header>
  )
}
