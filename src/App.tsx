import { useEffect, useState } from 'react'
import Header from './components/Header'
import AllStarBanner from './components/AllStarBanner'
import HeroStrip from './components/HeroStrip'
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

  useEffect(() => {
    fetchConfig()
      .then(cfg => setShowAllStarBanner(cfg.allStarBanner))
      .catch(() => setShowAllStarBanner(false))
  }, [])

  return (
    <div className="min-h-screen bg-phillies-cream">
      <Header />
      {showAllStarBanner && <AllStarBanner />}
      {/* Self-hides unless a Phillies game is live; mounted outside the tab
          conditionals so its polling survives tab switches. */}
      <LiveGameStrip />
      <HeroStrip />
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
