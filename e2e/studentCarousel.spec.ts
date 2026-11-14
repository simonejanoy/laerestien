import { expect, test, type Page } from '@playwright/test'
import { roster } from '../src/features/class/roster.ts'

// Elevkortene på statistikksiden: «Neste» og «Forrige» blar med en glideanimasjon. Testene sjekker at riktige elever
// vises (også på siste side), at siden ikke endrer høyde, at et dobbelttrykk midt i animasjonen ikke hopper over en side,
// og at «redusert bevegelse» bytter uten gliding.

const PAGE_SIZE = 8
const shortName = (name: string) => {
  const [first, last] = name.split(' ')
  return last ? `${first} ${last[0]}.` : first
}
const sorted = [...roster].sort((a, b) => a.name.localeCompare(b.name, 'nb')).map((s) => shortName(s.name))
const pages = Array.from({ length: Math.ceil(sorted.length / PAGE_SIZE) }, (_, i) => sorted.slice(i * PAGE_SIZE, i * PAGE_SIZE + PAGE_SIZE))

const shown = (page: Page) => page.locator('ul:not([aria-hidden]) li')
const next = (page: Page) => page.getByRole('button', { name: 'Neste elever' })
const previous = (page: Page) => page.getByRole('button', { name: 'Forrige elever' })
/** Venter til blaingen er ferdig (siden som glir ut er borte) og sjekker elevene. */
async function expectPage(page: Page, i: number) {
  await expect(page.locator('ul[aria-hidden]:not(.invisible)')).toHaveCount(0)
  await expect(shown(page)).toHaveText(pages[i])
}
const contentTop = async (page: Page) => (await page.getByTestId('under').boundingBox())!.y

for (const viewport of [
  { name: 'PC', width: 1100, height: 900 },
  { name: 'iPad', width: 820, height: 1180 },
  { name: 'mobil', width: 390, height: 844 },
]) {
  test(`«Neste» og «Forrige» viser riktige elever, også på siste side – ${viewport.name}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.setViewportSize(viewport)
    await page.goto('/e2e/harness.html?visning=statistikk')
    expect(pages.length).toBe(3)
    expect(pages[2].length).toBeLessThan(PAGE_SIZE)

    await expectPage(page, 0)
    const top = await contentTop(page)

    for (const i of [1, 2]) {
      await next(page).click()
      // Midt i animasjonen: begge sidene finnes, og innholdet under står stille.
      expect(await contentTop(page)).toBe(top)
      // … og kortene som glir, gir ikke vannrett scrolling (viktig på mobil og iPad).
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      await expectPage(page, i)
      expect(await contentTop(page)).toBe(top)
    }
    await expect(next(page)).toBeDisabled()

    for (const i of [1, 0]) {
      await previous(page).click()
      expect(await contentTop(page)).toBe(top)
      await expectPage(page, i)
    }
    await expect(previous(page)).toBeDisabled()
    expect(errors).toEqual([])
  })
}

test('glir fra høyre ved «Neste» og fra venstre ved «Forrige»', async ({ page }) => {
  await page.goto('/e2e/harness.html?visning=statistikk')
  await expectPage(page, 0)
  const startX = async () =>
    page.locator('ul:not([aria-hidden])').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)
  await next(page).click()
  expect(await startX()).toBeGreaterThan(0)
  await expectPage(page, 1)
  await previous(page).click()
  expect(await startX()).toBeLessThan(0)
  await expectPage(page, 0)
})

test('to raske trykk midt i en animasjon hopper ikke over en side, og raske blaing etter hverandre virker', async ({ page }) => {
  await page.goto('/e2e/harness.html?visning=statistikk')
  await expectPage(page, 0)
  await next(page).click()
  await next(page).click({ force: true })
  await expectPage(page, 1)
  // Blaing rett etter hverandre (når hver animasjon er ferdig) går gjennom alle sidene.
  await next(page).click()
  await expectPage(page, 2)
  await previous(page).click()
  await expectPage(page, 1)
  await previous(page).click()
  await expectPage(page, 0)
})

test('redusert bevegelse: kortene byttes uten gliding', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/e2e/harness.html?visning=statistikk')
  await expectPage(page, 0)
  await next(page).click()
  const x = await page.locator('ul:not([aria-hidden])').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)
  expect(x).toBe(0)
  await expectPage(page, 1)
  await next(page).click()
  await expectPage(page, 2)
})
