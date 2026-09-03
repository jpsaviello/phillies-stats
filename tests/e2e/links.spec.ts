import { expect, test } from '@playwright/test'
import { SAMPLE, gotoTab, useApp } from '../support/app'

/**
 * The clickable player rows of a stats table.
 *
 * Deliberately not a bare `tbody tr`: the Batting tab renders Hot & Cold's own
 * table ABOVE the stats table, so the first `tbody tr` on the page is a
 * recent-form row that opens nothing.
 */
const ROW = 'tbody tr[role="button"]'

/**
 * Deep links to a player and to a game.
 *
 * This is the behaviour the hash router was written for, and the part with the
 * most ways to break silently: modal state is DERIVED from the URL rather than
 * synced to it, so a cold link only works if the tab's own fetch lands and the
 * id is found in the loaded rows.
 */

test('a cold player link opens the modal once the data lands', async ({ page }) => {
  const app = await useApp(page)
  // Cold: the modal has to appear from the URL alone, with no click and no
  // prior state — the case a shared link actually exercises.
  await page.goto(`/#/batting?player=${SAMPLE.playerId}`)

  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible({ timeout: 20_000 })
  await expect(dialog).toContainText(SAMPLE.playerName)
  expect(app.missingFixtures, 'uncovered API calls').toEqual([])
})

test('a cold game link opens the box score', async ({ page }) => {
  const app = await useApp(page)
  await page.goto(`/#/today?game=${SAMPLE.gamePk}`)

  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible({ timeout: 20_000 })
  // The linescore header is the part of the modal that proves the box score
  // itself resolved, not just the shell.
  await expect(dialog).toContainText(/Final/i)
  expect(app.missingFixtures, 'uncovered API calls').toEqual([])
})

test('clicking a row opens the modal and puts it in the URL', async ({ page }) => {
  await useApp(page)
  await gotoTab(page, 'batting')
  await expect.poll(() => page.locator(ROW).count(), { timeout: 15_000 }).toBeGreaterThan(0)

  await page.locator(ROW).first().click()

  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 20_000 })
  await expect(page).toHaveURL(/#\/batting\?player=\d+/)
})

test('Back closes the modal instead of leaving the site', async ({ page }) => {
  // The bug the router exists to fix: on a phone the back swipe after opening a
  // game log used to exit the app.
  await useApp(page)
  await gotoTab(page, 'batting')
  await expect.poll(() => page.locator(ROW).count(), { timeout: 15_000 }).toBeGreaterThan(0)

  await page.locator(ROW).first().click()
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 20_000 })

  await page.goBack()

  await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  await expect(page).toHaveURL(/#\/batting$/)
  // Still on the app, with the tab intact.
  await expect(page.locator('nav button[aria-current="page"]')).toHaveText(/Batting/i)
})

test('an open modal covers the nav, and closing it gives the tab back', async ({ page }) => {
  // The modal overlay sits at z-50 and the nav at z-10, so a reader cannot
  // change tabs underneath an open modal — they close it first. Asserting the
  // real interaction rather than a click that the overlay would swallow.
  await useApp(page)
  await page.goto(`/#/batting?player=${SAMPLE.playerId}`)
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 20_000 })

  await page.keyboard.press('Escape')

  await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  await expect(page).toHaveURL(/#\/batting$/)

  // And the nav is usable again.
  await page.getByRole('button', { name: 'Standings', exact: true }).click()
  await expect(page).toHaveURL(/#\/standings$/)
})

test('a tab switch drops the modal from the URL', async ({ page }) => {
  // setTab clears player/game, so a modal cannot reopen over an unrelated tab
  // once that tab's data loads.
  await useApp(page)
  await gotoTab(page, 'batting')
  await expect.poll(() => page.locator(ROW).count(), { timeout: 15_000 }).toBeGreaterThan(0)
  await page.locator(ROW).first().click()
  await expect(page).toHaveURL(/player=\d+/)

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Schedule', exact: true }).click()

  await expect(page).toHaveURL(/#\/schedule$/)
  await expect(page.locator('[role="dialog"]')).toHaveCount(0)
})

test('a malformed id renders no modal rather than erroring', async ({ page }) => {
  const app = await useApp(page)
  await page.goto('/#/batting?player=not-a-number')
  await page.locator('main').waitFor({ state: 'visible' })
  await expect.poll(() => page.locator(ROW).count(), { timeout: 15_000 }).toBeGreaterThan(0)

  await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  expect(app.consoleErrors).toEqual([])
})

test('an id matching no loaded row renders no modal', async ({ page }) => {
  const app = await useApp(page)
  await page.goto('/#/batting?player=1')
  await page.locator('main').waitFor({ state: 'visible' })
  await expect.poll(() => page.locator(ROW).count(), { timeout: 15_000 }).toBeGreaterThan(0)

  await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  expect(app.consoleErrors).toEqual([])
})
