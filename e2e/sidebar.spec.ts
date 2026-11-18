import { expect, test } from '@playwright/test'

// Sidemenyen på lærersidene (AppLayout): alltid åpen på vanlige skjermbredder, uten knapp for å skjule den. På smale
// skjermer blir den automatisk en stripe med ikoner, der hvert ikon har et navn og går til siden. Testsiden viser det
// ekte oppsettet uten innlogging og uten Firebase (e2e/harness.tsx, visning=meny).

const url = '/e2e/harness.html?visning=meny'
const pages = ['Hjem', 'Statistikk', 'Alle tema']

test('bred skjerm: hele menyen står åpen, og det finnes ingen knapp som lukker eller åpner den', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(url)
  const menu = page.locator('aside#sidemeny')
  await expect(menu).toBeVisible()
  for (const name of pages) await expect(menu.getByRole('link', { name })).toBeVisible()
  await expect(page.getByTestId('ikonmeny')).toBeHidden()
  for (const name of [/skjul meny/i, /vis meny/i, /åpne meny/i, /lukk meny/i]) await expect(page.getByRole('button', { name })).toHaveCount(0)
  // Innholdet ligger ved siden av menyen, ikke under den.
  const menuBox = (await menu.boundingBox())!
  const contentBox = (await page.getByRole('heading', { name: 'Hjem-siden' }).boundingBox())!
  expect(contentBox.x).toBeGreaterThanOrEqual(menuBox.x + menuBox.width)
})

test('smal skjerm: menyen blir en stripe med ikoner som har navn og går til sidene', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 })
  await page.goto(url)
  const rail = page.getByTestId('ikonmeny')
  await expect(rail).toBeVisible()
  await expect(page.locator('aside#sidemeny')).toBeHidden()
  expect((await rail.boundingBox())!.width).toBeLessThanOrEqual(80)
  for (const name of pages) {
    const link = rail.getByRole('link', { name })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('title', name)
  }
  await expect(rail.getByRole('button', { name: 'Logg ut' })).toBeVisible()
  for (const name of [/skjul meny/i, /vis meny/i, /åpne meny/i, /lukk meny/i]) await expect(page.getByRole('button', { name })).toHaveCount(0)

  await rail.getByRole('link', { name: 'Statistikk' }).click()
  await expect(page.getByRole('heading', { name: 'Statistikk-siden' })).toBeVisible()
  await expect(rail.getByRole('link', { name: 'Statistikk' })).toHaveAttribute('aria-current', 'page')
  // Innholdet ligger til høyre for stripa, og siden kan ikke rulles sidelengs.
  const railBox = (await rail.boundingBox())!
  const contentBox = (await page.getByRole('heading', { name: 'Statistikk-siden' }).boundingBox())!
  expect(contentBox.x).toBeGreaterThanOrEqual(railBox.x + railBox.width)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
