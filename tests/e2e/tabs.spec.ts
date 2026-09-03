import { expect, test } from '@playwright/test'
import { gotoTab, useApp } from '../support/app'

/**
 * Every tab loads and puts its own content on screen.
 *
 * The single most valuable thing this file does is fail when a tab renders
 * nothing — the failure mode neither `npm run build` nor Vitest can see, and
 * the one a visitor notices first.
 */

const TABS = [
  // Each landmark is the panel that tab exists for, not a generic heading, so
  // a tab that mounts but whose content is broken still fails here.
  { id: 'today', label: 'Today', landmark: /Next game|Live now/i },
  { id: 'batting', label: 'Batting', landmark: /Hot & Cold/i },
  { id: 'pitching', label: 'Pitching', landmark: /Bullpen Usage/i },
  { id: 'roster', label: 'Roster', landmark: /Active Roster/i },
  { id: 'standings', label: 'Standings', landmark: /Playoff Push/i },
  { id: 'schedule', label: 'Schedule', landmark: /Next up|Jump to/i },
] as const

for (const tab of TABS) {
  test(`${tab.id} tab renders its own content`, async ({ page }) => {
    const app = await useApp(page)
    await gotoTab(page, tab.id)

    await expect(page.locator('main')).toContainText(tab.landmark, { timeout: 15_000 })
    // The nav has to agree with the URL, or Back and the tab bar disagree about
    // where the reader is.
    await expect(page.locator('nav button[aria-current="page"]')).toHaveText(new RegExp(tab.label, 'i'))

    expect(app.missingFixtures, 'uncovered API calls — re-run npm run test:e2e:record').toEqual([])
    expect(app.consoleErrors).toEqual([])
  })
}

test('the tables actually have rows', async ({ page }) => {
  // A table that renders its header and no body passes a "does the tab load"
  // check while being completely broken.
  const app = await useApp(page)
  for (const tab of ['batting', 'pitching', 'roster']) {
    await gotoTab(page, tab)
    await expect.poll(() => page.locator('tbody tr').count(), { timeout: 15_000 }).toBeGreaterThan(5)
  }
  expect(app.consoleErrors).toEqual([])
})

test('the summary strip above the nav survives a page load', async ({ page }) => {
  const app = await useApp(page)
  await gotoTab(page, 'today')

  // HeroStrip hides itself only when every one of its three fetch chains fails,
  // so its absence here would mean the whole strip regressed to all-or-nothing.
  await expect(page.getByText('Record', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Team Leaders', { exact: true })).toBeVisible()
  expect(app.consoleErrors).toEqual([])
})

test('an unknown hash falls back to the default tab', async ({ page }) => {
  await useApp(page)
  await page.goto('/#/does-not-exist')
  await page.locator('main').waitFor({ state: 'visible' })
  // A stale link should land somewhere real rather than on an empty <main>.
  await expect(page.locator('nav button[aria-current="page"]')).toHaveText(/Today/i)
})
