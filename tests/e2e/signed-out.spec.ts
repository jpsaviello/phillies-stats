import { expect, test } from '@playwright/test'
import { gotoTab, useApp } from '../support/app'

/**
 * What a signed-out visitor sees — which is nearly everyone.
 *
 * The account features were added on the explicit promise that they are
 * invisible when signed out, so the app a visitor sees is the app it was
 * before. `/api/me` answers `{"user": null}` in the fixtures, which is the
 * signed-out state the backend really returns.
 */

test('the header offers sign-in and no account chrome', async ({ page }) => {
  const app = await useApp(page)
  await gotoTab(page, 'today')

  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  expect(app.consoleErrors).toEqual([])
})

test('no "Your Players" card', async ({ page }) => {
  await useApp(page)
  await gotoTab(page, 'today')
  await expect(page.locator('main')).toContainText(/Next game|Live now/i, { timeout: 15_000 })

  // FavoritesCard self-hides when signed out, and must not even reserve space.
  await expect(page.getByText('Your Players')).toHaveCount(0)
})

test('no star buttons on the stats tables', async ({ page }) => {
  await useApp(page)
  for (const tab of ['batting', 'pitching', 'roster']) {
    await gotoTab(page, tab)
    await expect.poll(() => page.locator('tbody tr').count(), { timeout: 15_000 }).toBeGreaterThan(0)
    // Signed out, the star column doesn't exist — the sticky Player column keeps
    // its original narrower width precisely because of this. StarButton labels
    // itself "Star <name>" / "Unstar <name>".
    await expect(page.getByRole('button', { name: /^(Star|Unstar) / })).toHaveCount(0)
  }
})

test('every tab still renders its data signed out', async ({ page }) => {
  // The whole point: none of the stats are behind the account.
  const app = await useApp(page)
  await gotoTab(page, 'standings')
  await expect(page.locator('main')).toContainText(/Playoff Push/i, { timeout: 15_000 })
  await gotoTab(page, 'batting')
  await expect(page.locator('main')).toContainText(/Hot & Cold/i, { timeout: 15_000 })
  expect(app.consoleErrors).toEqual([])
})
