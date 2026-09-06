import { useEffect, useState } from 'react'
import {
  applyThemePreference,
  nextThemePreference,
  readThemePreference,
  themeLabel,
  writeThemePreference,
  type ThemePreference,
} from '../utils/theme'

/**
 * Icons are authored SVG in the same 1.8 stroke as the search field and the
 * tables' disclosure chevron, so the app has one icon voice rather than a
 * borrowed set.
 */
function Icon({ preference }: { preference: ThemePreference }) {
  const common = {
    viewBox: '0 0 20 20',
    'aria-hidden': true,
    className: 'h-4 w-4',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (preference === 'light') {
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="3.4" />
        <path d="M10 2.4v1.7M10 15.9v1.7M2.4 10h1.7M15.9 10h1.7M4.6 4.6l1.2 1.2M14.2 14.2l1.2 1.2M15.4 4.6l-1.2 1.2M5.8 14.2l-1.2 1.2" />
      </svg>
    )
  }
  if (preference === 'dark') {
    return (
      <svg {...common}>
        <path d="M16.2 11.8A6.8 6.8 0 0 1 8.2 3.8a6.8 6.8 0 1 0 8 8Z" />
      </svg>
    )
  }
  // System: a display, because the choice is being delegated to the device.
  return (
    <svg {...common}>
      <rect x="2.6" y="4" width="14.8" height="9.6" rx="1.4" />
      <path d="M7.4 17h5.2M10 13.6V17" />
    </svg>
  )
}

/**
 * Cycles system → light → dark.
 *
 * The applied theme lives on `document.documentElement` rather than in React
 * state that renders a class, because every colour in this app is a token the
 * CSS re-points off `[data-theme]` — there is nothing for a component to
 * restyle, which is the same property that made replacing the whole visual
 * world a token-only diff.
 */
export default function ThemeToggle() {
  // Initialised from storage rather than defaulted, so the button's icon agrees
  // with what the pre-paint script in index.html already put on the document.
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference)

  useEffect(() => {
    applyThemePreference(preference, document.documentElement)
  }, [preference])

  function cycle() {
    const next = nextThemePreference(preference)
    writeThemePreference(next)
    setPreference(next)
  }

  const label = themeLabel(preference)
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-rule px-2.5 text-gray-600 transition-colors hover:border-rule-heavy hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-phillies-red/40"
    >
      <Icon preference={preference} />
    </button>
  )
}
