import { useFlags } from 'launchdarkly-react-client-sdk'

// LaunchDarkly onboarding demo — safe to remove. Gated by the "my-first-flag"
// boolean flag; toggle it in the LaunchDarkly dashboard to show/hide this.
export default function LaunchDarklyDemoBanner() {
  const { myFirstFlag } = useFlags()

  if (!myFirstFlag) return null

  return (
    <div className="bg-phillies-navy text-white">
      <div className="max-w-7xl mx-auto px-4 py-2 text-sm font-semibold text-center">
        🚩 LaunchDarkly is working — this banner is controlled by the{' '}
        <code className="bg-white/20 px-1 rounded">my-first-flag</code> feature flag
      </div>
    </div>
  )
}
