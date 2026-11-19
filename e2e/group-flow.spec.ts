import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

test('create a group, split expenses, join via invite, settle up', async ({ browser }) => {
  const run = Date.now()
  const anuEmail = `anu-${run}@example.com`
  const raviEmail = `ravi-${run}@example.com`

  // --- Anu creates the group and adds placeholders for Ravi and Chetan
  const anu = await (await browser.newContext()).newPage()
  await signIn(anu, anuEmail)
  await anu.getByRole('link', { name: 'Account' }).click()
  await anu.getByLabel('Your name').fill('Anu')
  await anu.getByRole('button', { name: 'Save' }).click()
  await expect(anu.getByText('Saved.')).toBeVisible()
  await anu.getByRole('link', { name: 'Back' }).click()

  await anu.getByRole('button', { name: '+ New group' }).click()
  await anu.getByPlaceholder('e.g. Goa Trip, Flat 4B').fill('Goa Trip')
  await anu.getByRole('button', { name: 'Create group' }).click()

  await expect(anu.getByRole('heading', { name: 'Members' })).toBeVisible()
  for (const name of ['Ravi', 'Chetan']) {
    await anu.getByPlaceholder('Add someone by name').fill(name)
    await anu.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(anu.getByText(name, { exact: true })).toBeVisible()
  }
  const inviteUrl = (await anu.locator('p.font-mono').textContent())!.trim()
  await anu.getByRole('link', { name: 'Back' }).click()

  // --- Dinner ₹3,000 paid by Anu, equal three ways
  await anu.getByRole('link', { name: '+ Add expense' }).click()
  await anu.getByLabel('Amount (₹)').fill('3000')
  await anu.getByLabel('What was it for?').fill('Dinner')
  await anu.getByRole('button', { name: 'Add expense' }).click()
  await expect(anu.getByText('Anu paid ₹3,000')).toBeVisible()

  // --- Taxi ₹600 paid by Ravi, split Ravi + Chetan
  await anu.getByRole('link', { name: '+ Add expense' }).click()
  await anu.getByLabel('Amount (₹)').fill('600')
  await anu.getByLabel('What was it for?').fill('Taxi')
  await anu.getByLabel('Paid by').selectOption({ label: 'Ravi' })
  await anu.getByRole('checkbox').first().uncheck() // Anu not on the taxi
  await anu.getByRole('button', { name: 'Add expense' }).click()
  await expect(anu.getByText('Ravi paid ₹600')).toBeVisible()

  await anu.getByRole('button', { name: 'balances' }).click()
  await expect(anu.getByText('Chetan pays Anu ₹1,300')).toBeVisible()
  await expect(anu.getByText('Ravi pays Anu ₹700')).toBeVisible()
  await anu.screenshot({ path: 'test-results/anu-balances.png', fullPage: true })

  // --- Ravi opens the invite link, signs in, and claims his placeholder
  const ravi = await (await browser.newContext()).newPage()
  await signIn(ravi, raviEmail, new URL(inviteUrl).pathname)
  await expect(ravi.getByRole('heading', { name: 'Goa Trip' })).toBeVisible()
  await ravi.screenshot({ path: 'test-results/ravi-join.png', fullPage: true })
  await ravi.getByText("I'm Ravi").click()
  await ravi.getByRole('button', { name: 'Join Goa Trip' }).click()
  await expect(ravi.getByText('You owe ₹700')).toBeVisible()

  // Ravi cannot edit Anu's expense
  await ravi.getByText('Dinner').click()
  await expect(ravi.getByText('Only Anu, who added this expense, can edit it.')).toBeVisible()
  await expect(ravi.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
  await ravi.getByRole('link', { name: 'Back' }).click()

  // Ravi records paying Anu via the suggestion
  await ravi.getByRole('link', { name: 'Settle up' }).click()
  await ravi.locator('li', { hasText: 'Ravi pays Anu' }).getByRole('button', { name: 'Record' }).click()
  await ravi.getByRole('button', { name: 'Record payment' }).click()
  await expect(ravi.getByText('All settled')).toBeVisible()

  // Anu sees the update live (realtime), without reloading
  await expect(anu.getByText('Ravi pays Anu ₹700')).toHaveCount(0, { timeout: 15_000 })
  await expect(anu.getByText('Chetan pays Anu ₹1,300')).toBeVisible()
  await anu.getByRole('button', { name: 'expenses' }).click()
  await anu.screenshot({ path: 'test-results/anu-expenses.png', fullPage: true })
})
