import { useEffect, useState } from 'react'
import { daysBehind, easternToday, formatDate } from '../utils/date'

// Written by the on-this-day-reporter routine, which commits
// public/on-this-day.json each morning — see
// docs/routines/on-this-day-reporter.md for the contract.
interface OnThisDay {
  // ET date the card was written for. Drives staleness, same as Briefing.date.
  date: string
  // Date the historical game actually happened — decades behind `date` by
  // design, which is why the two are separate fields.
  historicalDate: string
  generatedAt: string
  headline: string
  recap: string[]
}

// Matches DailyBriefing: a card older than this means the routine stopped
// running, so it's dropped rather than presented as today's card.
const MAX_AGE_DAYS = 2

function isOnThisDay(data: unknown): data is OnThisDay {
  const d = data as OnThisDay | null
  return (
    typeof d?.date === 'string' &&
    typeof d.historicalDate === 'string' &&
    typeof d.headline === 'string' &&
    Array.isArray(d.recap) &&
    d.recap.length > 0 &&
    d.recap.every(p => typeof p === 'string')
  )
}

export default function OnThisDayCard() {
  const [onThisDay, setOnThisDay] = useState<OnThisDay | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    // no-cache revalidates on every load so the morning push isn't masked by
    // a cached copy of yesterday's card.
    fetch('/on-this-day.json', { cache: 'no-cache' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`on-this-day ${res.status}`))))
      .then((data: unknown) => {
        if (!isOnThisDay(data)) return
        // Measured against `date`, never `historicalDate` — the historical game
        // is always old, that's the point of the card.
        if (daysBehind(data.date, easternToday()) > MAX_AGE_DAYS) return
        setOnThisDay(data)
      })
      .catch(() => setOnThisDay(null))
  }, [])

  // Supplementary to the tabs below it, so a missing, malformed, or stale
  // card renders nothing rather than an error or an empty shell.
  if (!onThisDay) return null

  const year = onThisDay.historicalDate.slice(0, 4)
  const fullDate = formatDate(onThisDay.historicalDate, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    // Wrapper lives in App.tsx — see the matching comment in DailyBriefing.
    <div className="flex-1 min-w-0">
      <div className="card overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="w-full px-4 py-3 text-left hover:bg-phillies-cream transition-colors"
        >
          <div className="flex items-center gap-2">
            <span aria-hidden="true">🕰️</span>
            <span className="card-label">
              On This Day — {year}
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
            {onThisDay.headline}
          </div>
        </button>
        {/* max-w-3xl caps the measure: full-width prose runs ~150 characters a
            line on desktop. */}
        {expanded && (
          <div className="px-4 py-3 border-t border-gray-100 space-y-2 max-w-3xl">
            <div className="font-display text-xs uppercase tracking-wider text-phillies-red">
              {fullDate}
            </div>
            {onThisDay.recap.map((paragraph, i) => (
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
