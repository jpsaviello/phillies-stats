import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { withLDProvider } from 'launchdarkly-react-client-sdk'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import './index.css'
import App from './App.tsx'

const clientSideID = import.meta.env.VITE_LAUNCHDARKLY_CLIENT_SIDE_ID?.trim()
if (!clientSideID) {
  throw new Error('LaunchDarkly: missing client-side ID. Set VITE_LAUNCHDARKLY_CLIENT_SIDE_ID.')
}

// Deliberately NOT asyncWithLDProvider. That one initializes the LD client
// *before* render, which put a third party on the critical path to first paint:
// nothing drew -- not the header, not the pinstripe -- until LD answered or its
// timeout fired, so a content blocker or a restrictive network meant up to five
// seconds of blank white page. withLDProvider initializes at mount instead, so
// the app paints immediately and flags reconcile a moment later.
//
// Nothing is lost by not waiting. Every flag App.tsx reads is destructured with
// a code default (`enableDailyBriefing = true`, ...), and useFlags() returns an
// empty object until the client is ready -- so those defaults already describe
// exactly what renders during initialization, which is the same thing they
// describe when LD is unreachable entirely. Awaiting bought nothing they didn't
// already provide.
//
// The one cost is a flash if a flag's LD value differs from its code default:
// the panel would render, then hide. Checked against production when this was
// written, every flag's served value matched its default, so there was nothing
// to flicker. bootstrap: 'localStorage' covers the rest -- a returning visitor
// evaluates from their last known values synchronously, so only a first-ever
// visit could see it, and only for a flag that has since been switched off.
//
// `timeout` no longer gates rendering; it still bounds the client's own
// initialization.
const LDApp = withLDProvider({
  clientSideID,
  context: { kind: 'user', key: 'anonymous', anonymous: true },
  options: { bootstrap: 'localStorage' },
  timeout: 5,
})(App)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LDApp />
  </StrictMode>,
)
