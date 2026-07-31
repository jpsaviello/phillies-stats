import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { asyncWithLDProvider } from 'launchdarkly-react-client-sdk'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import './index.css'
import App from './App.tsx'

const clientSideID = import.meta.env.VITE_LAUNCHDARKLY_CLIENT_SIDE_ID?.trim()
if (!clientSideID) {
  throw new Error('LaunchDarkly: missing client-side ID. Set VITE_LAUNCHDARKLY_CLIENT_SIDE_ID.')
}

void (async () => {
  const LDProvider = await asyncWithLDProvider({
    clientSideID,
    context: { kind: 'user', key: 'anonymous', anonymous: true },
    timeout: 5,
  })

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LDProvider>
        <App />
      </LDProvider>
    </StrictMode>,
  )
})()
