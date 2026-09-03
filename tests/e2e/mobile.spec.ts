import { expect, test } from '@playwright/test'
import { gotoTab, useApp } from '../support/app'

/** Clickable stats rows only — see the note in links.spec.ts. */
const ROW = 'tbody tr[role="button"]'

/**
 * Phone behaviour. Runs only in the `mobile` project (iPhone SE, 375px) — the
 * width the sticky Player column and the horizontal table scrollers were tuned
 * against.
 */

const TABS = ['today', 'batting', 'pitching', 'roster', 'standings', 'schedule']

test('no tab overflows the viewport horizontally', async ({ page }) => {
  // The page body must never scroll sideways. Wide content (tables, charts) is
  // supposed to scroll inside its own container instead, so an overflow here
  // means something escaped its ScrollX wrapper.
  const app = await useApp(page)
  for (const tab of TABS) {
    await gotoTab(page, tab)
    await expect(page.locator('main')).not.toBeEmpty({ timeout: 15_000 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    // 1px of slack for fractional device pixels.
    expect(overflow, `${tab} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1)
  }
  expect(app.consoleErrors).toEqual([])
})

test('every nav tab is reachable and switches the view', async ({ page }) => {
  // The nav is a horizontal scroller at this width, so the later tabs are off
  // screen until scrolled — clicking them has to work anyway.
  await useApp(page)
  await gotoTab(page, 'today')

  for (const label of ['Batting', 'Pitching', 'Roster', 'Standings', 'Schedule', 'Today']) {
    const tab = page.getByRole('button', { name: label, exact: true })
    await tab.scrollIntoViewIfNeeded()
    await tab.click()
    await expect(page.locator('nav button[aria-current="page"]')).toHaveText(new RegExp(label, 'i'))
    await expect(page.locator('main')).not.toBeEmpty()
  }
})

test('the nav stays reachable after scrolling down a long tab', async ({ page }) => {
  // The nav is sticky; if that ever breaks, a phone reader has to scroll all
  // the way back up to change tabs.
  await useApp(page)
  await gotoTab(page, 'batting')
  await expect.poll(() => page.locator(ROW).count(), { timeout: 15_000 }).toBeGreaterThan(5)

  await page.mouse.wheel(0, 2000)
  await expect(page.getByRole('button', { name: 'Standings', exact: true })).toBeInViewport()
})

test('a player modal opens and closes on a phone', async ({ page }) => {
  await useApp(page)
  await gotoTab(page, 'batting')
  await expect.poll(() => page.locator(ROW).count(), { timeout: 15_000 }).toBeGreaterThan(0)

  await page.locator(ROW).first().click()
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible({ timeout: 20_000 })

  // The modal must not introduce sideways scroll of its own at 375px.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  expect(overflow).toBeLessThanOrEqual(1)

  await page.goBack()
  await expect(dialog).toHaveCount(0)
})
