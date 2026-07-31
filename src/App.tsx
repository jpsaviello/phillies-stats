import { useEffect, useState } from 'react'
import { useFlags } from 'launchdarkly-react-client-sdk'
import Header from './components/Header'
import AllStarBanner from './components/AllStarBanner'
import LaunchDarklyDemoBanner from './components/LaunchDarklyDemoBanner'
import HeroStrip from './components/HeroStrip'
import DailyBriefing from './components/DailyBriefing'
import LiveGameStrip from './components/LiveGameStrip'
import Nav, { type Tab } from './components/Nav'
import BattingTable from './components/BattingTable'
import PitchingTable from './components/PitchingTable'
import Standings from './components/Standings'
import Schedule from './components/Schedule'
import ChatWidget from './components/ChatWidget'
import { fetchConfig } from './api/mlb'

export default function App() {
  const [tab, setTab] = useState<Tab>('batting')
  // Gated on the backend feature flag; starts hidden so a disabled or
  // unreachable flag never flashes the banner before config resolves.
  const [showAllStarBanner, setShowAllStarBanner] = useState(false)
  // Manual kill switch, independent of DailyBriefing's own self-hide logic.
  // Defaults true so an unreachable LD client preserves today's behavior
  // (briefing shows) rather than silently hiding it.
  const { enableDailyBriefing = true } = useFlags()

  useEffect(() => {
    fetchConfig()
      .then(cfg => setShowAllStarBanner(cfg.allStarBanner))
      .catch(() => setShowAllStarBanner(false))
  }, [])

  return (
    <div className="min-h-screen bg-phillies-cream">
      <Header />
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
