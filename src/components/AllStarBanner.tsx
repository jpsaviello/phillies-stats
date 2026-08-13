import { useState } from 'react'
import { ALL_STARS_2026 } from '../data/allStars'

const DISMISS_KEY = 'phillies_allstar_banner_dismissed_2026'

export default function AllStarBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === 'true'
    } catch {
      return false
    }
  })

  if (dismissed) return null

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, 'true')
    } catch {
      // ignore -- fail open, banner still hides for this session via state
    }
    setDismissed(true)
  }

  return (
    <div className="bg-yellow-400 text-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2">
        {/* The dismiss button is a sibling of the scrolling region, not inside
            it: with the roster in the same overflow-x-auto row, `ml-auto` did
            nothing once the content overflowed and the × sat off-screen at
            mobile widths, unreachable without scrolling the banner sideways. */}
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap flex-1 min-w-0">
          <span aria-hidden="true">★</span>
          <span className="font-semibold">2026 NL All-Stars:</span>
          <span>
            {ALL_STARS_2026.map((player, i) => (
              <span key={player.name}>
                {i > 0 && ' · '}
                {player.name} ({player.position})
              </span>
            ))}
          </span>
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss All-Star banner"
          className="shrink-0 text-gray-900 hover:text-gray-700 font-bold px-3 py-2 -my-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/40"
        >
          ×
        </button>
      </div>
    </div>
  )
}
