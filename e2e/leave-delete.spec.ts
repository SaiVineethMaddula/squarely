import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

test('multiple payers, remove, leave and delete a group', async ({ browser }) => {
  const run = Date.now()
  const anu = await (await browser.newContext()).newPage()
  await signIn(anu, `anu2-${run}@example.com`, '/', 'Anu')

  await anu.getByRole('button', { name: '+ New group' }).click()
  await anu.getByPlaceholder('e.g. Goa Trip, Flat 4B').fill('Flat 4B')
  await anu.getByRole('button', { name: 'Create group' }).click()
  for (const name of ['Ravi', 'Typo']) {
    await anu.getByPlaceholder('Add someone by name').fill(name)
    await anu.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(anu.getByText(name, { exact: true })).toBeVisible()
  }

  // Admin removes a name added by mistake (₹0 balance)
  anu.once('dialog', (d) => d.accept())
  await anu.locator('li', { hasText: 'Typo' }).getByRole('button', { name: 'Remove' }).click()
  await expect(anu.getByText('Typo', { exact: true })).toHaveCount(0)
  const inviteUrl = (await anu.locator('p.font-mono').textContent())!.trim()
  await anu.getByRole('link', { name: 'Back' }).click()

  // Groceries ₹900: Anu paid ₹600 and Ravi paid ₹300, split equally
  await anu.getByRole('link', { name: '+ Add expense' }).click()
  await anu.getByLabel('Amount (₹)').fill('900')
  await anu.getByLabel('What was it for?').fill('Groceries')
  await anu.getByRole('button', { name: 'More than one person paid' }).click()
  await anu.getByLabel('Amount Anu paid').fill('600')
  await expect(anu.getByText('₹300 left')).toBeVisible()
  await expect(anu.getByRole('button', { name: 'Add expense' })).toBeDisabled()
  await anu.getByLabel('Amount Ravi paid').fill('300')
  await anu.screenshot({ path: 'test-results/multi-payer.png', fullPage: true })
  await anu.getByRole('button', { name: 'Add expense' }).click()
  await expect(anu.getByText('Anu & Ravi paid ₹900')).toBeVisible()
  await expect(anu.getByText('You get back ₹150')).toBeVisible()

  // Ravi joins and can't leave while he owes ₹150
  const ravi = await (await browser.newContext()).newPage()
  await signIn(ravi, `ravi2-${run}@example.com`, new URL(inviteUrl).pathname, 'Ravi')
  await ravi.getByText("I'm Ravi").click()
  await ravi.getByRole('button', { name: 'Join Flat 4B' }).click()
  await ravi.getByRole('link', { name: 'Members' }).click()
  await expect(ravi.getByText('You can leave once you\'re settled up. You owe ₹150')).toBeVisible()
  await expect(ravi.getByRole('button', { name: 'Leave group' })).toBeDisabled()

  // Anu (admin) can't delete while Ravi owes money
  await anu.getByRole('link', { name: 'Members' }).click()
  await expect(anu.getByRole('button', { name: 'Delete group…' })).toBeDisabled()
  await expect(anu.getByText('Still to settle:')).toBeVisible()

  // Ravi settles up, then leaves
  await ravi.getByRole('link', { name: 'Back' }).click()
  await ravi.getByRole('link', { name: 'Settle up' }).click()
  await ravi.locator('li', { hasText: 'Ravi pays Anu' }).getByRole('button', { name: 'Record' }).click()
  await ravi.getByRole('button', { name: 'Record payment' }).click()
  await expect(ravi.getByText('All settled')).toBeVisible()
  await ravi.getByRole('link', { name: 'Members' }).click()
  ravi.once('dialog', (d) => d.accept())
  await ravi.getByRole('button', { name: 'Leave group' }).click()
  await expect(ravi.getByText('No groups yet.')).toBeVisible()

  // Anu still sees Ravi's history, marked (left)
  await anu.reload()
  await anu.getByRole('link', { name: 'Back' }).click()
  await expect(anu.getByText('Anu & Ravi (left) paid ₹900')).toBeVisible()

  // Everyone settled: Anu deletes the group permanently
  await anu.getByRole('link', { name: 'Members' }).click()
  await anu.getByRole('button', { name: 'Delete group…' }).click()
  await expect(anu.getByRole('button', { name: 'Delete forever' })).toBeDisabled()
  await anu.getByLabel('Type Flat 4B to confirm').fill('Flat 4B')
  await anu.screenshot({ path: 'test-results/delete-group.png', fullPage: true })
  await anu.getByRole('button', { name: 'Delete forever' }).click()
  await expect(anu.getByText('No groups yet.')).toBeVisible()
})
