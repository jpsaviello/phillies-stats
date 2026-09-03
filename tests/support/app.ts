import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page, Route } from '@playwright/test'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const FIXTURES_DIR = path.join(HERE, '..', 'fixtures')

/**
 * The instant every test pretends it is: 2:00 PM on 2026-09-03, Eastern.
 *
 * Fixed for one specific reason. The app derives its request URLs from the
 * current baseball day — `/schedule?startDate=2026-08-24&endDate=2026-09-10` —
 * so a fixture recorded today stops matching tomorrow's URL, and a suite that
 * rots overnight is worse than no suite. Freezing the clock makes every URL
 * stable, which is what lets the fixtures be committed at all.
 *
 * Mid-afternoon ET on a day the Phillies played, so the recorded window holds
 * both a completed game and a scheduled one.
 */
export const FROZEN_NOW = new Date('2026-09-03T18:00:00Z')

/**
 * The specific rows the deep-link specs open, and the recorder captures.
 *
 * Shared between the two so they cannot drift: if the recorder walked the UI by
 * clicking instead, it would capture whatever happened to sort first that day
 * and the specs would ask for something else.
 */
export const SAMPLE = {
  /** Bryce Harper — an everyday player, so his row survives any sort or filter. */
  playerId: 547180,
  playerName: 'Bryce Harper',
  /** PHI 0-1 at Arizona on 2026-09-02: the last completed game before FROZEN_NOW. */
  gamePk: 825037,
} as const

/** Filename for a recorded response: readable prefix + hash of the full URL. */
export function fixtureKey(url: string): string {
  const { pathname, search } = new URL(url)
  const slug = `${pathname}${search}`
    .replace(/^\/api\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `${slug}-${createHash('sha1').update(`${pathname}${search}`).digest('hex').slice(0, 8)}`
}

/**
 * Everything the page would otherwise fetch from the open internet.
 *
 * LaunchDarkly is answered rather than aborted: an aborted SDK logs its own
 * errors, and the suite asserts a clean console, so filtering those back out
 * would quietly weaken the assertion that actually catches app bugs. An empty
 * flag payload is exactly the "LD unreachable" case every flag's code default
 * already describes.
 */
async function stubExternalHosts(page: Page) {
  // CORS matters: these are cross-origin from localhost, and a fulfilled
  // response without these headers is blocked by the browser, which the LD SDK
  // then reports as a fetch error — the very console noise this exists to stop.
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    // The SDK reads the Date header to sync its clock; without exposing it the
    // browser logs 'Refused to get unsafe header "date"'.
    'access-control-expose-headers': 'date',
  }

  // ORDER IS LOAD-BEARING. Playwright matches routes last-registered-first, so
  // the broad catch-all goes FIRST and the specific handlers after it, or the
  // catch-all answers everything and the flag payload never arrives.
  await page.route('**://*.launchdarkly.com/**', route =>
    route.fulfill({ status: 202, headers: cors, contentType: 'application/json', body: '{}' })
  )
  await page.route('**://app.launchdarkly.com/sdk/goals/**', route =>
    route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '[]' })
  )
  // An empty flag payload is exactly the "LD unreachable" case every flag's code
  // default in App.tsx already describes, so the app under test is the app a
  // visitor gets when LaunchDarkly is blocked.
  await page.route('**://app.launchdarkly.com/sdk/evalx/**', route =>
    route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{}' })
  )

  // Headshots and team logos. A 1x1 gif rather than an abort: aborting trips
  // the components' onError handlers, which is a different render than a real
  // visitor gets and would hide a broken <img> layout.
  await page.route('**://*.mlbstatic.com/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'image/gif',
      body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
    })
  )
}

/**
 * Console lines that are the BROWSER narrating an HTTP status, not the app
 * misbehaving.
 *
 * The only one in practice is /api/odds answering 503, which the fixtures
 * replay faithfully because the recording backend had no ODDS_API_KEY — and
 * which Schedule/HeroStrip/Today all handle by design (`fetchOdds().catch`).
 * Everything the app itself logs, and every uncaught exception, still fails.
 */
const BROWSER_NOISE = [/^Failed to load resource:/]

/** True only for the app's own backend calls (`/api/...`), never `/src/api/...`. */
function isApiCall(url: URL): boolean {
  return url.pathname.startsWith('/api/')
}

export interface AppHarness {
  /** API paths the app asked for that no fixture covers. Must stay empty. */
  missingFixtures: string[]
  /** Console messages that aren't expected noise. Must stay empty. */
  consoleErrors: string[]
}

/**
 * Freezes the clock, stubs the network, and starts collecting the two things
 * every spec asserts on. Call before the first navigation.
 */
export async function useApp(page: Page): Promise<AppHarness> {
  const harness: AppHarness = { missingFixtures: [], consoleErrors: [] }

  // setFixedTime, NOT clock.install(): install() also fakes setTimeout and
  // requestAnimationFrame, and React's scheduler leans on those — faking them
  // stalls rendering. Only Date needs to lie here.
  await page.clock.setFixedTime(FROZEN_NOW)

  await stubExternalHosts(page)

  // A path predicate, NOT the glob '**/api/**': that glob also matches Vite's
  // own module requests for src/api/*.ts in dev, which would intercept the app's
  // source files on their way to the browser.
  await page.route(isApiCall, async (route: Route) => {
    const url = route.request().url()
    const file = path.join(FIXTURES_DIR, `${fixtureKey(url)}.json`)
    if (!existsSync(file)) {
      const { pathname, search } = new URL(url)
      harness.missingFixtures.push(`${pathname}${search}`)
      // 599 rather than a passthrough: an uncovered call must fail loudly here
      // instead of silently reaching the network and making CI depend on MLB.
      return route.fulfill({ status: 599, contentType: 'application/json', body: '{}' })
    }
    const recorded = JSON.parse(await readFile(file, 'utf8')) as {
      status: number
      contentType: string
      body: string
    }
    await route.fulfill({
      status: recorded.status,
      contentType: recorded.contentType,
      body: recorded.body,
    })
  })

  page.on('console', message => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (BROWSER_NOISE.some(pattern => pattern.test(text))) return
    harness.consoleErrors.push(text)
  })
  page.on('pageerror', error => harness.consoleErrors.push(`pageerror: ${error.message}`))

  return harness
}

/**
 * Navigates to a tab and waits for its content rather than for a network idle:
 * LiveGameStrip polls on a timer, so "no requests in flight" is a state this
 * app can be slow to reach and never a signal that the tab has rendered.
 */
export async function gotoTab(page: Page, tab: string) {
  await page.goto(`/#/${tab}`)
  await page.locator('main').waitFor({ state: 'visible' })
}
