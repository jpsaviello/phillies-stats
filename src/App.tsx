import { useState } from 'react'
import Header from './components/Header'
import AllStarBanner from './components/AllStarBanner'
import Nav, { type Tab } from './components/Nav'
import BattingTable from './components/BattingTable'
import PitchingTable from './components/PitchingTable'
import Standings from './components/Standings'
import Schedule from './components/Schedule'

export default function App() {
  const [tab, setTab] = useState<Tab>('batting')

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <AllStarBanner />
      <Nav active={tab} onChange={setTab} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'batting' && <BattingTable />}
        {tab === 'pitching' && <PitchingTable />}
        {tab === 'standings' && <Standings />}
        {tab === 'schedule' && <Schedule />}
      </main>
    </div>
  )
}
