import { useEffect, useState } from 'react'
import { scrollBehavior } from '../utils/motion'

/**
 * Appears once the page is scrolled well past the fold and returns to the top.
 *
 * The Roster tab is three sections and ~40 rows, and the schedule is a month of
 * games; reaching the bottom of either leaves the tab bar a long flick away.
 *
 * Stacked ABOVE the chat FAB rather than beside it — that button is
 * `fixed bottom-4 right-4` at 56px, so this one sits at bottom-20 in the same
 * column. z-30 is one below the chat widget's z-40 on purpose: the full-screen
 * mobile chat sheet then covers this button instead of leaving a stray arrow
 * floating over the conversation.
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600)
    // Evaluated once on mount too: a reload that restores a deep scroll position
    // fires no scroll event, and the button would be missing until the first
    // flick.
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      aria-label="Back to top"
      title="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
      className="fixed bottom-20 right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-panel-raised text-mark shadow-[0_3px_10px_rgb(0_0_0/0.22)] transition-colors hover:border-phillies-red hover:text-live focus:outline-none focus-visible:ring-2 focus-visible:ring-phillies-red/40"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M10 15.5V5M10 5l-5 5M10 5l5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
