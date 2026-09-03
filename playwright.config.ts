import { defineConfig, devices } from '@playwright/test'

/**
 * Browser smoke tests. These are the layer above `npm test` (Vitest, pure utils
 * only) and below the manual `webapp-testing` pass a finished feature still
 * requires: they prove every tab loads, deep links resolve, signed-out visitors
 * see the app they used to see, and nothing overflows on a phone.
 *
 * The suite is **hermetic**. Every `/api/**` call is served from a recorded
 * fixture and every external host is stubbed, so it needs no backend, no
 * ODDS_API_KEY / DATABASE_URL, and no reachable statsapi.mlb.com. That is the
 * whole point: a smoke suite that fails when MLB has a bad afternoon gets
 * muted within a week, and a muted suite is worse than none.
 *
 * Refresh the fixtures with `npm run test:e2e:record` (that one DOES need both
 * dev servers up — see tests/record-fixtures.mjs).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // A committed `.only` would silently shrink the suite to one test in CI.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: 'http://localhost:5174',
    /**
     * Pinned, and load-bearing twice over. The app renders first pitch in the
     * READER's timezone, so an unpinned runner would print a different string
     * on every machine; and pinning it to Eastern means these tests say nothing
     * about the ET date handling, which is deliberate — that is the Vitest
     * suite's job, where the runner sits in Pacific precisely so the assertions
     * discriminate.
     */
    timezoneId: 'America/New_York',
    trace: 'on-first-retry',
    /**
     * Escape hatch for environments that already ship a Chromium build older
     * than the one this Playwright version expects (this repo's cloud sandbox
     * pre-installs one at /opt/pw-browsers/chromium). Unset in CI, where
     * `npx playwright install chromium` fetches the matching build.
     */
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
          // Same escape hatch, same reason: those sandboxes run as root, and
          // Chromium refuses to start as root with its own sandbox enabled.
          // Deliberately NOT set on the CI path, where the sandbox stays on.
          args: ['--no-sandbox'],
        }
      : {},
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      // The phone-specific checks are meaningless at 1280px.
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      // Real mobile viewport + touch, so the overflow and navigation checks mean
      // something. 375px wide, the width the tables were tuned against. Tab
      // loading runs here too: a panel can render fine on desktop and collapse
      // on a phone.
      name: 'mobile',
      use: {
        // A Chromium-based descriptor on purpose: the iPhone device profiles
        // default to WebKit, which this suite does not install.
        ...devices['Pixel 7'],
        // Narrowed to the width every mobile decision in this app was made
        // against — the sticky Player column, the ScrollX fades, the nav bar.
        viewport: { width: 375, height: 667 },
      },
      testMatch: /(mobile|tabs)\.spec\.ts/,
    },
  ],

  webServer: {
    // A port of its own, so a dev server already running on 5173 is neither
    // clobbered nor accidentally used as the system under test.
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // main.tsx throws at module scope without this, which would leave the
      // whole suite staring at a blank page. The value is never used: every
      // LaunchDarkly endpoint is stubbed, and each flag falls back to the code
      // default in App.tsx's useFlags() destructure.
      VITE_LAUNCHDARKLY_CLIENT_SIDE_ID: '00000000000000000000000000000000',
    },
  },
})
