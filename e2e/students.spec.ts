import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { roster } from '../src/features/class/roster.ts'

// Siden «Elever» (ikke i sidemenyen lenger): en elevkonto som lages, kobles til eleven som allerede står i klasselista –
// aldri en elev til – og eleven får framdriften i økta. Testeleven er Nora (nivå 3): kontoen heter «Nora Teigen», og hun
// vises som «Nora L.». Lokal erstatning for Firebase (se e2e/liveHarness.tsx).
// Passordet lages tilfeldig i testen; ingen passord ligger i koden.

const base = '/e2e/harness.html?visning=okt&okt=okt-1-2&kontoer=ingen'
const noraRows = (page: Page) => page.locator('li[data-student="Nora L."]')

async function createAccount(page: Page, name: string, email: string) {
  await page.getByLabel('Navn').fill(name)
  await page.getByLabel('E-post').fill(email)
  await page.getByLabel(/Passord/).fill(randomUUID())
  await page.getByRole('button', { name: 'Lag elevkonto' }).click()
}

test('ny konto for Nora kobles til Nora i klasselista, på nivå 3, og gir framdrift i økta', async ({ context }) => {
  const errors: string[] = []
  const teacher = await context.newPage()
  teacher.on('pageerror', (e) => errors.push(e.message))
  await teacher.goto(`${base}&rolle=laerer&side=elever`)

  // Før: Nora står i lista, uten konto, og lista er klasselista.
  await expect(noraRows(teacher)).toHaveCount(1)
  await expect(noraRows(teacher)).toContainText('Ingen konto ennå')
  await expect(teacher.locator('li[data-student]')).toHaveCount(roster.length)

  // Kontoen heter «Nora Teigen» (som i Firebase), men kobles på e-posten til raden «Nora L.».
  await createAccount(teacher, 'Nora Teigen', 'nora@teigen.no')
  await expect(teacher.getByRole('status')).toContainText('koblet til Nora L. i klasselista (nivå 3)')
  await expect(noraRows(teacher)).toHaveCount(1)
  await expect(noraRows(teacher)).toContainText('nora@teigen.no')
  await expect(teacher.getByLabel('Nivå for Nora L.')).toHaveValue('3')
  await expect(teacher.locator('li[data-student]')).toHaveCount(roster.length)

  // Samme e-post en gang til, eller samme navn med en annen e-post: avvises, fortsatt én Nora.
  await createAccount(teacher, 'Nora Teigen', 'NORA@teigen.no')
  await expect(teacher.getByRole('alert')).toContainText('har allerede en konto')
  await createAccount(teacher, 'Nora L.', 'nora.lie@teigen.no')
  await expect(teacher.getByRole('alert')).toContainText('har allerede en konto')
  await expect(noraRows(teacher)).toHaveCount(1)
  await expect(teacher.locator('li[data-student]')).toHaveCount(roster.length)

  // Live-økta: én Nora i lista, og leveringene hennes kommer fram hos læreren.
  await teacher.goto(`${base}&rolle=laerer`)
  await expect(noraRows(teacher)).toHaveCount(1)
  await expect(teacher.locator('li[data-student]')).toHaveCount(roster.length)
  // Med bildet hennes, og ingen Nora Teigen uten bilde.
  await expect(noraRows(teacher).locator('img')).toHaveCount(1)
  await expect(teacher.locator('li[data-student="Nora Teigen"]')).toHaveCount(0)
  await teacher.getByRole('button', { name: 'Start økt' }).click()

  const student = await context.newPage()
  student.on('pageerror', (e) => errors.push(e.message))
  await student.goto(`${base}&rolle=elev`)
  await expect(student.getByRole('navigation', { name: 'Bla mellom oppgavene' })).toContainText('Oppgave 1 av')
  const answers = await student.evaluate(() => (window as unknown as { studentAnswers: number[] }).studentAnswers)
  await student.getByLabel('Ditt svar').fill(String(answers[0]))
  await student.getByRole('button', { name: 'Sjekk svaret mitt' }).click()

  await expect(noraRows(teacher)).toContainText(`Pågår · 1 av ${answers.length} levert`)
  await expect(noraRows(teacher)).toContainText('Nivå 3')
  expect(errors).toEqual([])
})
