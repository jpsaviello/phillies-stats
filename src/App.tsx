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
import Roster from './components/Roster'
import Standings from './components/Standings'
import Schedule from './components/Schedule'
import ChatWidget from './components/ChatWidget'
import FavoritesCard from './components/FavoritesCard'
import { fetchConfig } from './api/mlb'
import { fetchCurrentUser } from './api/auth'
import { addFavorite, fetchFavorites, removeFavorite } from './api/favorites'
import { fetchProfile } from './api/profile'
import type { User } from './types/auth'
import type { Favorite } from './types/favorites'
import type { Profile } from './types/profile'

export default function App() {
  const [tab, setTab] = useState<Tab>('batting')
  // Gated on the backend feature flag; starts hidden so a disabled or
  // unreachable flag never flashes the banner before config resolves.
  const [showAllStarBanner, setShowAllStarBanner] = useState(false)
  // Manual kill switch, independent of DailyBriefing's own self-hide logic.
  // Defaults true so an unreachable LD client preserves today's behavior
  // (briefing shows) rather than silently hiding it.
  // enableGameDetail gates only the Schedule row's click affordance, so flag-off
  // leaves that tab exactly as it was before box scores existed.
  // enableMatchupPreview likewise gates only the pregame panel above that list.
  // enableBullpenUsage gates only the panel above the Pitching tab's table.
  // enableRosterTab is the first flag that gates a whole TAB, so flag-off has to
  // remove the nav entry too, not just the panel — see the `hidden` prop below.
  const {
    enableDailyBriefing = true,
    enableOnThisDay = true,
    enableGameDetail = true,
    enableMatchupPreview = true,
    enableBullpenUsage = true,
    enableRosterTab = true,
  } = useFlags()
  // Lives here rather than inside AuthWidget so features added later can gate
  // on it. The session cookie is httpOnly, so the only way to know who's
  // signed in is to ask the backend.
  const [user, setUser] = useState<User | null>(null)
  // Lives here, not in the tables: both tables and FavoritesCard read it, and
  // the tables unmount on every tab switch.
  const [favorites, setFavorites] = useState<Favorite[]>([])
  // Lives here, next to user/favorites: the header (avatar + name) and the
  // profile modal both need it.
  const [profile, setProfile] = useState<Profile | null>(null)

  // LD pushes flag changes live, so the roster tab can be turned off while it's
  // the one being viewed. Without this the nav entry disappears and <main>
  // renders nothing, with no tab highlighted and no way back except a click.
  useEffect(() => {
    if (!enableRosterTab && tab === 'roster') setTab('batting')
  }, [enableRosterTab, tab])

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

  // Same arrangement as favorites: keyed on user, clears on sign-out, runs
  // again right after sign-in. fetchProfile never rejects.
  useEffect(() => {
    if (user === null) {
      setProfile(null)
      return
    }
    fetchProfile().then(setProfile)
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
      <Header user={user} onAuthChange={setUser} profile={profile} onProfileChange={setProfile} />
      <LaunchDarklyDemoBanner />
      {showAllStarBanner && <AllStarBanner />}
      {/* Self-hides unless a Phillies game is live; mounted outside the tab
          conditionals so its polling survives tab switches. */}
      <LiveGameStrip />
      <HeroStrip />
      {/* Self-hides unless you're signed in with at least one starred player. */}
      <FavoritesCard signedIn={user !== null} favorites={favorites} />
      {/* Both self-hide when they have nothing fresh to show, and each owns its
          own fetch and collapse state. They share a row from sm up rather than
          stacking, because both are one-line headlines at rest and the stack
          above the tab bar is already several screens tall on a phone. flex-1
          on each child means a lone survivor still fills the row. */}
      {(enableDailyBriefing || enableOnThisDay) && (
        <div className="max-w-7xl mx-auto px-4 pt-3 flex flex-col sm:flex-row gap-3">
          {enableDailyBriefing && <DailyBriefing />}
          {enableOnThisDay && <OnThisDayCard />}
        </div>
      )}
      <Nav
        active={tab}
        onChange={setTab}
        hidden={enableRosterTab ? [] : ['roster']}
      />
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
            enableBullpenUsage={enableBullpenUsage}
          />
        )}
        {tab === 'roster' && enableRosterTab && (
          <Roster
            signedIn={user !== null}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
          />
        )}
        {tab === 'standings' && <Standings />}
        {tab === 'schedule' && (
          <Schedule
            enableGameDetail={enableGameDetail}
            enableMatchupPreview={enableMatchupPreview}
          />
        )}
      </main>
      {/* Mounted once, outside the tab conditionals, so chat history survives tab switches. */}
      <ChatWidget />
    </div>
  )
}
