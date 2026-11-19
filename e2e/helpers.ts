import { expect, type Page } from '@playwright/test'

/** Local Supabase captures sign-in emails in Mailpit. */
const MAILPIT = 'http://127.0.0.1:54324'

async function latestCode(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`)
    const { messages } = (await res.json()) as { messages: { ID: string }[] }
    if (messages?.length) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()
      const match = String(msg.Text ?? msg.HTML).match(/\b(\d{6})\b/)
      if (match) return match[1]
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`No sign-in code arrived for ${email}`)
}

export async function signIn(page: Page, email: string, path = '/') {
  await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, { method: 'DELETE' })
  await page.goto(path)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Email me a sign-in code' }).click()
  const code = await latestCode(email)
  await page.getByLabel('Sign-in code').fill(code)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign-in code')).toHaveCount(0)
}
