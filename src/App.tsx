import { useEffect, useState } from 'react'
import { useFlags } from 'launchdarkly-react-client-sdk'
import Header from './components/Header'
import AllStarBanner from './components/AllStarBanner'
import LaunchDarklyDemoBanner from './components/LaunchDarklyDemoBanner'
import HeroStrip from './components/HeroStrip'
import TodayInPhils from './components/TodayInPhils'
import LiveGameStrip from './components/LiveGameStrip'
import Nav from './components/Nav'
import Today from './components/Today'
import BattingTable from './components/BattingTable'
import PitchingTable from './components/PitchingTable'
import Roster from './components/Roster'
import Standings from './components/Standings'
import Schedule from './components/Schedule'
import ChatWidget from './components/ChatWidget'
import BackToTop from './components/BackToTop'
import FavoritesCard from './components/FavoritesCard'
import { initRoute, setTab, useRoute } from './hooks/useRoute'
import { fetchConfig } from './api/mlb'
import { fetchCurrentUser } from './api/auth'
import { addFavorite, fetchFavorites, removeFavorite } from './api/favorites'
import { fetchProfile } from './api/profile'
import type { User } from './types/auth'
import type { Favorite } from './types/favorites'
import type { Profile } from './types/profile'

export default function App() {
  // The active tab lives in the URL rather than in state, so every view is
  // linkable and Back moves between them instead of leaving the site.
  const { tab } = useRoute()
  // Gated on the backend feature flag; starts hidden so a disabled or
  // unreachable flag never flashes the banner before config resolves.
  const [showAllStarBanner, setShowAllStarBanner] = useState(false)
  // Manual kill switch, independent of DailyBriefing's own self-hide logic.
  // Defaults true so an unreachable LD client preserves today's behavior
  // (briefing shows) rather than silently hiding it.
  // enableGameDetail gates only the Schedule row's click affordance, so flag-off
  // leaves that tab exactly as it was before box scores existed.
  // enableMatchupPreview likewise gates only the pregame panel above that list.
  // enableGameStory gates only the two visual sections INSIDE that modal. It is
  // nested under enableGameDetail on purpose: the charts are the novel half and
  // must be killable without taking the box score down with them.
  // enableBullpenUsage gates only the panel above the Pitching tab's table, and
  // enableBattingForm the matching Hot & Cold panel above the Batting tab's.
  // enableLeagueRankings gates only the panel at the foot of the Standings tab.
  // enableRosterTab is the first flag that gates a whole TAB, so flag-off has to
  // remove the nav entry too, not just the panel — see the `hidden` prop below.
  const {
    enableDailyBriefing = true,
    enableOnThisDay = true,
    enableGameDetail = true,
    enableMatchupPreview = true,
    enableGameStory = true,
    enableBullpenUsage = true,
    enableBattingForm = true,
    enableLeagueRankings = true,
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
    // replace, not push: pushing would leave the now-hidden roster tab in
    // history, so Back would land on it and bounce straight back here.
    if (!enableRosterTab && tab === 'roster') setTab('batting', { replace: true })
  }, [enableRosterTab, tab])

  // Gives a bare "/" the address of the tab it's actually showing.
  useEffect(initRoute, [])

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
    <div className="min-h-screen bg-stock">
      {/* One masthead, not seven stacked blocks. Each of these still owns its
          own fetch and still self-hides independently — nothing about their
          failure behavior changed — but they now read as rows of one ruled
          object rather than as separate cards each with its own border, label
          and air. The nav is this object's last row and carries its closing
          rule, which is why there is no border here.

          The win here is coherence, not height: measured on the Batting tab,
          chrome above the content went 498px → 486px at 1280 and 614px → 553px
          at 375. The remaining cost is HeroStrip's four cells (244px of the
          553 on a phone), which are still a 2x2 grid of stacked label/value
          boxes. Collapsing those to single-line ruled rows is the next real
          saving and was left out of this pass deliberately — it changes what
          each cell can show, which is a content decision, not a style one. */}
      <div className="bg-panel">
        <Header user={user} onAuthChange={setUser} profile={profile} onProfileChange={setProfile} />
        <LaunchDarklyDemoBanner />
        {showAllStarBanner && <AllStarBanner />}
        {/* Self-hides unless a Phillies game is live; mounted outside the tab
            conditionals so its polling survives tab switches. */}
        <LiveGameStrip />
        {/* The season variant on Today: that tab leads with the live-or-next game
            and recaps the last one, so the strip's two game cards would repeat
            both a few hundred pixels above in smaller type. */}
        <HeroStrip variant={tab === 'today' ? 'season' : 'full'} />
        {/* Self-hides unless you're signed in with at least one starred player. */}
        <FavoritesCard signedIn={user !== null} favorites={favorites} />
        {/* One module, two rows — each still owns its own fetch, expanded state
            and staleness cutoff, and each still self-hides independently. It was
            two stacked cards, which cost two borders and two section labels
            before the tab bar on a phone. */}
        <TodayInPhils showBriefing={enableDailyBriefing} showOnThisDay={enableOnThisDay} />
      </div>
      <Nav
        active={tab}
        onChange={setTab}
        hidden={enableRosterTab ? [] : ['roster']}
      />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* The default route. Reuses the same three flags the Schedule tab
            passes down, since it renders the same matchup panel and opens the
            same box score modal. */}
        {tab === 'today' && (
          <Today
            enableGameDetail={enableGameDetail}
            enableMatchupPreview={enableMatchupPreview}
            enableGameStory={enableGameStory}
          />
        )}
        {tab === 'batting' && (
          <BattingTable
            signedIn={user !== null}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            enableBattingForm={enableBattingForm}
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
        {tab === 'standings' && <Standings enableLeagueRankings={enableLeagueRankings} />}
        {tab === 'schedule' && (
          <Schedule
            enableGameDetail={enableGameDetail}
            enableMatchupPreview={enableMatchupPreview}
            enableGameStory={enableGameStory}
          />
        )}
      </main>
      {/* Mounted once, outside the tab conditionals, so chat history survives tab switches. */}
      <ChatWidget />
      {/* Self-hides until the page is scrolled; sits above the chat FAB. */}
      <BackToTop />
    </div>
  )
}
