import { useEffect, useState } from 'react'
import { fetchBattingStats, fetchPitchingStats, playerHeadshotUrl } from '../api/mlb'
import type { BattingStats, PitchingStats, Player } from '../types/mlb'
import type { Favorite } from '../types/favorites'

// Beyond this the card would dominate the page it sits above; the rest are
// still starred and still shown in the tables.
const MAX_SHOWN = 8

interface Props {
  signedIn: boolean
  favorites: Favorite[]
}

interface StatLine {
  label: string
  value: string
}

interface Loaded {
  batting: Map<number, { player: Player; stat: BattingStats }>
  pitching: Map<number, { player: Player; stat: PitchingStats }>
}

function hideOnError(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = 'none'
}

function battingLine(stat: BattingStats): StatLine[] {
  return [
    { label: 'AVG', value: stat.avg },
    { label: 'HR', value: String(stat.homeRuns) },
    { label: 'RBI', value: String(stat.rbi) },
  ]
}

function pitchingLine(stat: PitchingStats): StatLine[] {
  return [
    { label: 'ERA', value: stat.era },
    { label: 'K', value: String(stat.strikeOuts) },
    { label: 'W–L', value: `${stat.wins}–${stat.losses}` },
  ]
}

export default function FavoritesCard({ signedIn, favorites }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // Signed-out visitors never see this card, so they shouldn't pay for its
    // two fetches either.
    if (!signedIn) return
    let cancelled = false
    Promise.all([fetchBattingStats(), fetchPitchingStats()])
      .then(([batting, pitching]) => {
        if (cancelled) return
        setLoaded({
          batting: new Map(batting.map(s => [s.player.id, s])),
          pitching: new Map(pitching.map(s => [s.player.id, s])),
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
    // Stats are fetched once per sign-in, not per star: favorites are matched
    // against the already-loaded maps by player id.
  }, [signedIn])

  // No skeleton, unlike HeroStrip: this card is invisible to signed-out
  // visitors, so a placeholder would flash on every load for people who will
  // never see it. It just appears once there's something to show.
  if (!signedIn || favorites.length === 0 || failed || loaded === null) return null

  const shown = favorites.slice(0, MAX_SHOWN)
  const hidden = favorites.length - shown.length

  return (
    <div className="max-w-7xl mx-auto px-4 pt-3">
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
        <div className="font-display text-xs uppercase tracking-wider text-gray-400">
          Your Players
        </div>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2">
          {shown.map(favorite => {
            // Pitching first: a pitcher also shows up in the hitting response
            // (usually with an empty line), and their ERA is the useful stat.
            const pitcher = loaded.pitching.get(favorite.playerId)
            const batter = loaded.batting.get(favorite.playerId)
            const matched = pitcher ?? batter
            const stats = pitcher
              ? pitchingLine(pitcher.stat)
              : batter
                ? battingLine(batter.stat)
                : null
            // Falls back to the stored snapshot only when the player isn't in
            // this season's stats at all (traded, released, upstream gap).
            const name = matched?.player.fullName ?? favorite.playerName

            return (
              <div key={favorite.playerId} className="flex items-center gap-2 min-w-0">
                <img
                  src={playerHeadshotUrl(favorite.playerId)}
                  alt={name}
                  className="w-7 h-7 rounded-full shrink-0"
                  onError={hideOnError}
                />
                <div className="min-w-0">
                  <div className="text-sm text-gray-700 truncate">{name}</div>
                  {stats ? (
                    <div className="flex items-center gap-2">
                      {stats.map(({ label, value }) => (
                        <span key={label} className="flex items-baseline gap-1">
                          <span className="font-display text-[10px] uppercase tracking-wider text-gray-400">
                            {label}
                          </span>
                          <span className="font-display text-sm font-bold text-phillies-navy tabular-nums">
                            {value}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-300">—</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {hidden > 0 && <div className="text-xs text-gray-400 mt-2">+{hidden} more</div>}
      </div>
    </div>
  )
}
