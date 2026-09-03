/**
 * Records the `/api/**` responses the smoke suite replays.
 *
 * Unlike the suite itself, this DOES need both dev servers up and a reachable
 * statsapi.mlb.com:
 *
 *   npm run dev:server        # terminal 1
 *   npm run dev               # terminal 2  (port 5173)
 *   npm run test:e2e:record
 *
 * It drives the app the same way the specs do — every tab, a player modal, a
 * game modal — with the clock frozen to the same instant, so the URLs it
 * captures are exactly the URLs the specs will ask for. Re-run it when a
 * component starts calling a new endpoint (the suite will tell you: a missing
 * fixture fails the test by name).
 *
 * Fixtures are recorded through the app's own backend proxy, so what lands on
 * disk is what the browser really sees, `fields=` trimming and all.
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { FIXTURES_DIR, FROZEN_NOW, SAMPLE, fixtureKey } from './support/app.ts'

const BASE = process.env.RECORD_BASE_URL ?? 'http://localhost:5173'
const TABS = ['today', 'batting', 'pitching', 'roster', 'standings', 'schedule']

async function main() {
  await mkdir(FIXTURES_DIR, { recursive: true })

  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}
  )
  // Same timezone as playwright.config.ts, or the recorded schedule window
  // would be keyed to a different baseball day than the one the specs ask for.
  const context = await browser.newContext({ timeZoneId: 'America/New_York' })
  const page = await context.newPage()
  await page.clock.setFixedTime(FROZEN_NOW)

  const written = new Set()

  page.on('response', async response => {
    const url = response.url()
    // Only the app's own backend calls. A bare includes('/api/') also catches
    // Vite's module requests for src/api/*.ts and records 60KB of source.
    if (!new URL(url).pathname.startsWith('/api/')) return
    const key = fixtureKey(url)
    if (written.has(key)) return
    try {
      const body = await response.text()
      written.add(key)
      await writeFile(
        path.join(FIXTURES_DIR, `${key}.json`),
        JSON.stringify(
          {
            // Kept for humans reading a diff; the filename hash is the real key.
            url: new URL(url).pathname + new URL(url).search,
            status: response.status(),
            contentType: response.headers()['content-type'] ?? 'application/json',
            body,
          },
          null,
          0
        )
      )
    } catch {
      // A response that was still streaming when the page navigated away —
      // it will be captured on the next pass through that tab.
    }
  })

  for (const tab of TABS) {
    process.stdout.write(`  ${tab}…`)
    await page.goto(`${BASE}/#/${tab}`)
    await page.locator('main').waitFor({ state: 'visible' })
    // Long enough for the second-order fetches (a starter's game log, the
    // per-game boxscores BullpenUsage walks) to land.
    await page.waitForTimeout(6000)
    process.stdout.write(' done\n')
  }

  // The two modals, opened by deep link rather than by clicking a row: the
  // specs open them exactly this way, and clicking would capture whatever
  // happened to sort first on the recording day instead.
  for (const [label, hash] of [
    ['player modal', `#/batting?player=${SAMPLE.playerId}`],
    ['game modal', `#/today?game=${SAMPLE.gamePk}`],
  ]) {
    process.stdout.write(`  ${label}…`)
    await page.goto(`${BASE}/${hash}`)
    await page.locator('[role="dialog"]').waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForTimeout(6000)
    process.stdout.write(' done\n')
  }

  await browser.close()

  const files = existsSync(FIXTURES_DIR) ? await readdir(FIXTURES_DIR) : []
  console.log(`\n${written.size} responses recorded, ${files.length} fixture files on disk.`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
