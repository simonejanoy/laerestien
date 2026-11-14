import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { roster } from '../src/features/class/roster.ts'

// Læreren lager Amalies konto under «Elever» (lokal erstatning for Firebase, se e2e/liveHarness.tsx). Kontoen skal
// kobles til Amalie som allerede står i klasselista – aldri bli en elev til – og Amalie skal få framdriften i økta.
// Passordet lages tilfeldig i testen; ingen passord ligger i koden.

const base = '/e2e/harness.html?visning=okt&okt=okt-1-2&kontoer=ingen'
const amalieRows = (page: Page) => page.locator('li[data-student="Amalie Berg"]')

async function createAccount(page: Page, name: string, email: string) {
  await page.getByLabel('Navn').fill(name)
  await page.getByLabel('E-post').fill(email)
  await page.getByLabel(/Passord/).fill(randomUUID())
  await page.getByRole('button', { name: 'Lag elevkonto' }).click()
}

test('ny konto for Amalie kobles til Amalie i klasselista, på nivå 1, og gir framdrift i økta', async ({ context }) => {
  const errors: string[] = []
  const teacher = await context.newPage()
  teacher.on('pageerror', (e) => errors.push(e.message))
  await teacher.goto(`${base}&rolle=laerer&side=elever`)

  // Før: Amalie står i lista, uten konto, og lista er klasselista.
  await expect(amalieRows(teacher)).toHaveCount(1)
  await expect(amalieRows(teacher)).toContainText('Ingen konto ennå')
  await expect(teacher.locator('li[data-student]')).toHaveCount(roster.length)

  await createAccount(teacher, 'Amalie Berg', 'amalie@teigen.no')
  await expect(teacher.getByRole('status')).toContainText('koblet til Amalie Berg i klasselista (nivå 1)')
  await expect(amalieRows(teacher)).toHaveCount(1)
  await expect(amalieRows(teacher)).toContainText('amalie@teigen.no')
  await expect(teacher.getByLabel('Nivå for Amalie Berg')).toHaveValue('1')
  await expect(teacher.locator('li[data-student]')).toHaveCount(roster.length)

  // Samme e-post en gang til, eller samme navn med en annen e-post: avvises, fortsatt én Amalie.
  await createAccount(teacher, 'Amalie Berg', 'AMALIE@teigen.no')
  await expect(teacher.getByRole('alert')).toContainText('har allerede en konto')
  await createAccount(teacher, 'Amalie Berg', 'amalie.berg@teigen.no')
  await expect(teacher.getByRole('alert')).toContainText('har allerede en konto')
  await expect(amalieRows(teacher)).toHaveCount(1)
  await expect(teacher.locator('li[data-student]')).toHaveCount(roster.length)

  // Live-økta: én Amalie i lista, og leveringene hennes kommer fram hos læreren.
  await teacher.goto(`${base}&rolle=laerer`)
  await expect(amalieRows(teacher)).toHaveCount(1)
  await expect(teacher.locator('li[data-student]')).toHaveCount(roster.length)
  await teacher.getByRole('button', { name: 'Start økt' }).click()

  const student = await context.newPage()
  student.on('pageerror', (e) => errors.push(e.message))
  await student.goto(`${base}&rolle=elev`)
  await expect(student.getByRole('navigation', { name: 'Bla mellom oppgavene' })).toContainText('Oppgave 1 av')
  const answers = await student.evaluate(() => (window as unknown as { amalieAnswers: number[] }).amalieAnswers)
  await student.getByLabel('Ditt svar').fill(String(answers[0]))
  await student.getByRole('button', { name: 'Sjekk svaret mitt' }).click()

  await expect(amalieRows(teacher)).toContainText(`Pågår · 1 av ${answers.length} levert`)
  await expect(amalieRows(teacher)).toContainText('Nivå 1')
  expect(errors).toEqual([])
})
