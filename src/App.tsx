import { useEffect, useState } from 'react'
import { useFlags } from 'launchdarkly-react-client-sdk'
import Header from './components/Header'
import AllStarBanner from './components/AllStarBanner'
import LaunchDarklyDemoBanner from './components/LaunchDarklyDemoBanner'
import HeroStrip from './components/HeroStrip'
import DailyBriefing from './components/DailyBriefing'
import OnThisDayCard from './components/OnThisDayCard'
import LiveGameStrip from './components/LiveGameStrip'
import Nav, { type Tab } from './components/Nav'
import BattingTable from './components/BattingTable'
import PitchingTable from './components/PitchingTable'
import Standings from './components/Standings'
import Schedule from './components/Schedule'
import ChatWidget from './components/ChatWidget'
import FavoritesCard from './components/FavoritesCard'
import { fetchConfig } from './api/mlb'
import { fetchCurrentUser } from './api/auth'
import { addFavorite, fetchFavorites, removeFavorite } from './api/favorites'
import type { User } from './types/auth'
import type { Favorite } from './types/favorites'

export default function App() {
  const [tab, setTab] = useState<Tab>('batting')
  // Gated on the backend feature flag; starts hidden so a disabled or
  // unreachable flag never flashes the banner before config resolves.
  const [showAllStarBanner, setShowAllStarBanner] = useState(false)
  // Manual kill switch, independent of DailyBriefing's own self-hide logic.
  // Defaults true so an unreachable LD client preserves today's behavior
  // (briefing shows) rather than silently hiding it.
  const { enableDailyBriefing = true, enableOnThisDay = true } = useFlags()
  // Lives here rather than inside AuthWidget so features added later can gate
  // on it. The session cookie is httpOnly, so the only way to know who's
  // signed in is to ask the backend.
  const [user, setUser] = useState<User | null>(null)
  // Lives here, not in the tables: both tables and FavoritesCard read it, and
  // the tables unmount on every tab switch.
  const [favorites, setFavorites] = useState<Favorite[]>([])

  useEffect(() => {
    fetchConfig()
      .then(cfg => setShowAllStarBanner(cfg.allStarBanner))
      .catch(() => setShowAllStarBanner(false))
  }, [])

  useEffect(() => {
    // fetchCurrentUser never rejects — it resolves null when signed out or
    // unreachable, so there's no catch to add here.
    fetchCurrentUser().then(setUser)
  }, [])

  // Keyed on user so this also runs right after sign-in and clears on sign-out.
  // fetchFavorites never rejects, so there's no catch to add.
  useEffect(() => {
    if (user === null) {
      setFavorites([])
      return
    }
    fetchFavorites().then(setFavorites)
  }, [user])

  // Optimistic: the star flips immediately, the server's list replaces it on
  // success, and a failure restores the pre-click snapshot so a star can't lie
  // about having been saved.
  async function toggleFavorite(playerId: number, playerName: string) {
    const starred = favorites.some(f => f.playerId === playerId)
    const snapshot = favorites
    setFavorites(
      starred ? favorites.filter(f => f.playerId !== playerId) : [...favorites, { playerId, playerName }]
    )
    try {
      setFavorites(starred ? await removeFavorite(playerId) : await addFavorite(playerId, playerName))
    } catch {
      setFavorites(snapshot)
    }
  }

  return (
    <div className="min-h-screen bg-phillies-cream">
      <Header user={user} onAuthChange={setUser} />
      <LaunchDarklyDemoBanner />
      {showAllStarBanner && <AllStarBanner />}
      {/* Self-hides unless a Phillies game is live; mounted outside the tab
          conditionals so its polling survives tab switches. */}
      <LiveGameStrip />
      <HeroStrip />
      {/* Self-hides unless you're signed in with at least one starred player. */}
      <FavoritesCard signedIn={user !== null} favorites={favorites} />
      {/* Self-hides when no fresh briefing exists; mounted outside the tab
          conditionals so it reads the same on every tab. Also gated by the
          enable-daily-briefing flag as a manual kill switch. */}
      {enableDailyBriefing && <DailyBriefing />}
      {/* Stacked below the briefing, fully independent: its own fetch, its own
          collapse state, and it self-hides the same way. */}
      {enableOnThisDay && <OnThisDayCard />}
      <Nav active={tab} onChange={setTab} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'batting' && (
          <BattingTable
            signedIn={user !== null}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
          />
        )}
        {tab === 'pitching' && (
          <PitchingTable
            signedIn={user !== null}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
          />
        )}
        {tab === 'standings' && <Standings />}
        {tab === 'schedule' && <Schedule />}
      </main>
      {/* Mounted once, outside the tab conditionals, so chat history survives tab switches. */}
      <ChatWidget />
    </div>
  )
}
