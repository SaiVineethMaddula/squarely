import { devices, expect, test } from '@playwright/test'
import { signIn } from './helpers'

// Real iPhone Safari engine: date inputs render differently here than in desktop Chrome.
test.use({ ...devices['iPhone 13'] })

test('add-expense form fields do not overlap on a phone', async ({ page }) => {
  await signIn(page, `layout-${Date.now()}@example.com`)
  await page.getByRole('button', { name: '+ New group' }).click()
  await page.getByPlaceholder('e.g. Goa Trip, Flat 4B').fill('Layout check')
  await page.getByRole('button', { name: 'Create group' }).click()
  await page.getByRole('link', { name: 'Back' }).click()
  await page.getByRole('link', { name: '+ Add expense' }).click()

  const date = await page.getByLabel('Date').boundingBox()
  const category = await page.getByLabel('Category').boundingBox()
  await page.screenshot({ path: 'test-results/iphone-add-expense.png', fullPage: true })

  expect(date && category).toBeTruthy()
  // The date field must end before the category field starts (or sit above it).
  const sideBySide = Math.abs(date!.y - category!.y) < 5
  if (sideBySide) expect(date!.x + date!.width).toBeLessThanOrEqual(category!.x)
  else expect(date!.y + date!.height).toBeLessThanOrEqual(category!.y)
  // Nothing should poke past the screen edge.
  const viewport = page.viewportSize()!
  for (const box of [date!, category!]) expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
})
