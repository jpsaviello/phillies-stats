import { useState } from 'react'
import { formatDate } from '../utils/date'
import { useStoryCard } from '../hooks/useStoryCard'

/**
 * The two routine-written story cards, merged into one module.
 *
 * They shipped as two separate cards stacked on a phone — two card borders, two
 * section labels and two headlines before the tab bar, on a landing screen that
 * already carried a header, a banner, four summary cards and the nav. Both are
 * one-line headlines at rest, so they are two rows of one object rather than
 * two objects, and the stack above the nav gets shorter by roughly a card.
 *
 * What is deliberately unchanged: each entry still owns its own fetch, its own
 * expanded state and its own staleness cutoff, and each still self-hides
 * independently. The module disappears when neither has anything fresh, which
 * is the behavior both cards always had on their own.
 *
 * Neither JSON file is ever hand-edited — they are written by the
 * daily-beat-reporter and on-this-day-reporter routines. See
 * docs/routines/*.md for the contracts.
 */

interface Briefing {
  date: string
  generatedAt: string
  headline: string
  recap: string[]
}

interface OnThisDay {
  /** ET date the card was written for. Drives staleness, same as Briefing.date. */
  date: string
  /**
   * When the game actually happened — decades behind `date` by design, which is
   * why the two are separate fields. Never measure staleness against this one.
   */
  historicalDate: string
  generatedAt: string
  headline: string
  recap: string[]
}

function hasRecap(value: unknown): value is { headline: string; recap: string[]; date: string } {
  const v = value as { headline?: unknown; recap?: unknown; date?: unknown } | null
  return (
    typeof v?.date === 'string' &&
    typeof v.headline === 'string' &&
    Array.isArray(v.recap) &&
    v.recap.length > 0 &&
    v.recap.every(p => typeof p === 'string')
  )
}

function isBriefing(data: unknown): data is Briefing {
  return hasRecap(data)
}

function isOnThisDay(data: unknown): data is OnThisDay {
  return hasRecap(data) && typeof (data as OnThisDay).historicalDate === 'string'
}

interface RowProps {
  /** Read by screen readers in place of the emoji, which is decorative. */
  kind: string
  icon: string
  headline: string
  /** Small right-aligned qualifier: the briefing's date, or the game's year. */
  badge: string
  children: React.ReactNode
  /** Rows after the first draw a divider instead of sitting in their own card. */
  divided: boolean
}

function StoryRow({ kind, icon, headline, badge, children, divided }: RowProps) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={divided ? 'border-t border-gray-100' : undefined}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="w-full px-4 py-2 text-left hover:bg-stock transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden="true" className="shrink-0">{icon}</span>
          {/* The emoji carries the meaning visually; this carries it otherwise. */}
          <span className="sr-only">{kind}:</span>
          {/* truncate keeps every row exactly one line tall at rest, which is
              the entire point of merging the two cards. */}
          <span className="font-display font-bold text-mark truncate">{headline}</span>
          <span className="card-label ml-auto shrink-0 hidden sm:inline">{badge}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-gray-500 transition-transform sm:ml-2 ml-auto ${expanded ? 'rotate-180' : ''}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>
      {/* max-w-3xl caps the measure: full-width prose runs ~150 characters a
          line on desktop. */}
      {expanded && <div className="px-4 pb-3 space-y-2 max-w-3xl">{children}</div>}
    </div>
  )
}

function Paragraphs({ recap }: { recap: string[] }) {
  return (
    <>
      {recap.map((paragraph, i) => (
        <p key={i} className="text-sm text-gray-600 leading-relaxed">
          {paragraph}
        </p>
      ))}
    </>
  )
}

interface Props {
  /** enableDailyBriefing — the kill switch for the beat-reporter card. */
  showBriefing: boolean
  /** enableOnThisDay — the kill switch for the historical card. */
  showOnThisDay: boolean
}

export default function TodayInPhils({ showBriefing, showOnThisDay }: Props) {
  const briefing = useStoryCard<Briefing>('/briefing.json', isBriefing)
  const onThisDay = useStoryCard<OnThisDay>('/on-this-day.json', isOnThisDay)

  const rows = [
    showBriefing && briefing
      ? {
          key: 'briefing',
          kind: 'Daily briefing',
          icon: '📰',
          headline: briefing.headline,
          badge: formatDate(briefing.date, { month: 'short', day: 'numeric' }),
          body: <Paragraphs recap={briefing.recap} />,
        }
      : null,
    showOnThisDay && onThisDay
      ? {
          key: 'on-this-day',
          kind: 'On this day',
          icon: '🕰️',
          headline: onThisDay.headline,
          badge: onThisDay.historicalDate.slice(0, 4),
          body: (
            <>
              <div className="font-display text-xs uppercase tracking-wider text-live">
                {formatDate(onThisDay.historicalDate, { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              <Paragraphs recap={onThisDay.recap} />
            </>
          ),
        }
      : null,
  ].filter(row => row !== null)

  if (rows.length === 0) return null

  return (
    <div className="max-w-7xl mx-auto px-4 py-2 sm:py-3">
      <div className="card overflow-hidden">
        <div className="px-4 pt-2 pb-1">
          <span className="card-label">Today in Phils</span>
        </div>
        {rows.map((row, i) => (
          <StoryRow
            key={row.key}
            kind={row.kind}
            icon={row.icon}
            headline={row.headline}
            badge={row.badge}
            divided={i > 0}
          >
            {row.body}
          </StoryRow>
        ))}
      </div>
    </div>
  )
}
