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
import { fetchConfig } from './api/mlb'
import { fetchCurrentUser } from './api/auth'
import type { User } from './types/auth'

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

  return (
    <div className="min-h-screen bg-phillies-cream">
      <Header user={user} onAuthChange={setUser} />
      <LaunchDarklyDemoBanner />
      {showAllStarBanner && <AllStarBanner />}
      {/* Self-hides unless a Phillies game is live; mounted outside the tab
          conditionals so its polling survives tab switches. */}
      <LiveGameStrip />
      <HeroStrip />
      {/* Self-hides when no fresh briefing exists; mounted outside the tab
          conditionals so it reads the same on every tab. Also gated by the
          enable-daily-briefing flag as a manual kill switch. */}
      {enableDailyBriefing && <DailyBriefing />}
      {/* Stacked below the briefing, fully independent: its own fetch, its own
          collapse state, and it self-hides the same way. */}
      {enableOnThisDay && <OnThisDayCard />}
      <Nav active={tab} onChange={setTab} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'batting' && <BattingTable />}
        {tab === 'pitching' && <PitchingTable />}
        {tab === 'standings' && <Standings />}
        {tab === 'schedule' && <Schedule />}
      </main>
      {/* Mounted once, outside the tab conditionals, so chat history survives tab switches. */}
      <ChatWidget />
    </div>
  )
}
