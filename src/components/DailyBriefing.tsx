import { useEffect, useState } from 'react'
import { daysBehind, easternToday, formatDate } from '../utils/date'

// Written by the daily-beat-reporter routine, which commits public/briefing.json
// each morning — see docs/routines/daily-beat-reporter.md for the contract.
interface Briefing {
  date: string
  generatedAt: string
  headline: string
  recap: string[]
}

// A briefing older than this is dropped rather than shown as today's news,
// so a skipped or failed routine run degrades to nothing instead of stale copy.
const MAX_AGE_DAYS = 2

function isBriefing(data: unknown): data is Briefing {
  const b = data as Briefing | null
  return (
    typeof b?.date === 'string' &&
    typeof b.headline === 'string' &&
    Array.isArray(b.recap) &&
    b.recap.length > 0 &&
    b.recap.every(p => typeof p === 'string')
  )
}

export default function DailyBriefing() {
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    // no-cache revalidates on every load so the morning push isn't masked by
    // a cached copy of yesterday's briefing.
    fetch('/briefing.json', { cache: 'no-cache' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`briefing ${res.status}`))))
      .then((data: unknown) => {
        if (!isBriefing(data)) return
        if (daysBehind(data.date, easternToday()) > MAX_AGE_DAYS) return
        setBriefing(data)
      })
      .catch(() => setBriefing(null))
  }, [])

  // Supplementary to the tabs below it, so a missing, malformed, or stale
  // briefing renders nothing rather than an error or an empty shell.
  if (!briefing) return null

  const label = formatDate(briefing.date, { month: 'short', day: 'numeric' })

  return (
    // The page wrapper lives in App.tsx so this can sit beside OnThisDayCard on
    // wider screens; flex-1 makes it full width when that card self-hides.
    <div className="flex-1 min-w-0">
      <div className="card overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="w-full px-4 py-3 text-left hover:bg-phillies-cream transition-colors"
        >
          <div className="flex items-center gap-2">
            <span aria-hidden="true">📰</span>
            <span className="card-label">
              Daily Briefing — {label}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              className={`h-4 w-4 ml-auto shrink-0 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </div>
          <div className="font-display font-bold text-phillies-navy mt-0.5">
            {briefing.headline}
          </div>
        </button>
        {/* max-w-3xl caps the measure: full-width prose runs ~150 characters a
            line on desktop. */}
        {expanded && (
          <div className="px-4 py-3 border-t border-gray-100 space-y-2 max-w-3xl">
            {briefing.recap.map((paragraph, i) => (
              <p key={i} className="text-sm text-gray-600 leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
