import { expect, test } from '@playwright/test'
import { PASSWORD } from './fixture.ts'
import { seed } from './seed.ts'

test.beforeEach(seed)

test('пункты, набранные подряд, встают по порядку и не теряются', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('Пароль').fill(PASSWORD)
  const calendar = page.waitForResponse((r) => r.url().includes('/api/calendar/dues'))
  await page.getByRole('button', { name: 'Войти' }).click()
  await calendar

  await page.getByRole('button', { name: 'Заметки', exact: true }).click()
  const drawer = page.getByRole('complementary', { name: 'Заметки' })

  await drawer.getByRole('button', { name: /Список дел/ }).click()
  const card = drawer
    .locator('li.surface-note')
    .filter({ has: page.getByLabel('Заголовок заметки') })
  await card.getByRole('button', { name: '+ Новый пункт' }).click()
  const input = card.getByLabel('Новый пункт')
  const titles = Array.from({ length: 20 }, (_, i) => `пункт ${i}`)
  for (const title of titles) {
    await input.fill(title)
    await input.press('Enter')
  }

  await expect(card.getByRole('checkbox')).toHaveText(titles, { timeout: 20_000 })
})
