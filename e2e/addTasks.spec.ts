import { expect, test, type Page } from '@playwright/test'

// «Legg til oppgaver» på lærerens «Rediger oppgaver»: én knapp åpner en popup der læreren velger «Lag med AI» eller
// «Lag selv». Den ekte siden brukes, uten Firebase (se e2e/liveHarness.tsx). Ingen AI-kall gjøres.

const url = '/e2e/harness.html?visning=okt&rolle=laerer&okt=okt-1-2&side=rediger'

async function open(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'Oppgaver i nivå 1' })).toBeVisible()
  return errors
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Legg til oppgaver' })

test('6. «Legg til oppgaver» erstatter de to gamle inngangene og åpner popupen', async ({ page }) => {
  const errors = await open(page)
  // De gamle inngangene er borte.
  await expect(page.getByRole('button', { name: 'Lag oppgaver med AI' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Legg til oppgave', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Legg til oppgaver' }).click()
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).getByRole('tab', { name: 'Lag med AI' })).toHaveAttribute('aria-selected', 'true')
  await expect(dialog(page).getByRole('tab', { name: 'Lag selv' })).toHaveAttribute('aria-selected', 'false')

  // Escape lukker popupen, og fokus går tilbake til knappen.
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Legg til oppgaver' })).toBeFocused()

  // «Lukk» lukker også.
  await page.getByRole('button', { name: 'Legg til oppgaver' }).click()
  await dialog(page).getByRole('button', { name: 'Lukk' }).click()
  await expect(dialog(page)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('7. læreren kan bytte mellom «Lag med AI» og «Lag selv» med mus og piltaster', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Legg til oppgaver' }).click()
  const d = dialog(page)
  await d.getByRole('tab', { name: 'Lag selv' }).click()
  await expect(d.getByRole('tab', { name: 'Lag selv' })).toHaveAttribute('aria-selected', 'true')
  await expect(d.getByRole('tabpanel')).toContainText('Oppgavetype')

  // Piltastene bytter fane (WAI-ARIA-faner), og fokus følger med.
  await d.getByRole('tab', { name: 'Lag selv' }).press('ArrowLeft')
  await expect(d.getByRole('tab', { name: 'Lag med AI' })).toHaveAttribute('aria-selected', 'true')
  await expect(d.getByRole('tab', { name: 'Lag med AI' })).toBeFocused()
  await expect(d.getByRole('tabpanel')).toContainText('Andre ønsker (valgfritt)')
  await page.keyboard.press('ArrowRight')
  await expect(d.getByRole('tab', { name: 'Lag selv' })).toHaveAttribute('aria-selected', 'true')
})

test('8. «Lag selv» er rent manuelt (ingen AI-assistent) og legger oppgaven på riktig nivå uten å flytte siden', async ({ page }) => {
  const errors = await open(page)
  await page.getByRole('button', { name: 'Legg til oppgaver' }).click()
  const d = dialog(page)
  await d.getByRole('tab', { name: 'Lag selv' }).click()

  // Ingen AI-assistent i skjemaet.
  await expect(d.getByText('AI-assistent')).toHaveCount(0)
  await expect(d.getByLabel('Melding til AI-assistenten')).toHaveCount(0)
  await expect(d.getByPlaceholder(/Juster med AI/)).toHaveCount(0)
  await expect(d.getByRole('button', { name: 'Send til AI' })).toHaveCount(0)

  // Tydelige knapper: «Avbryt» og «Lagre oppgave». Ugyldig skjema gir en melding, ikke en oppgave.
  await d.getByLabel('Tekstoppgave').check()
  await d.getByRole('button', { name: 'Lagre oppgave' }).click()
  await expect(d.getByRole('alert')).toContainText('Skriv oppgaveteksten')

  // Tekstoppgave på nivå 2 med figur, mens siden viser nivå 1.
  await d.getByLabel('Nivå', { exact: true }).selectOption('2')
  await d.getByLabel('Oppgavetekst').fill('Se på figuren. Hvor mange hjørner har figuren?')
  await d.getByLabel('Fasit eller løsningsforslag').fill('6 hjørner')
  await d.getByLabel('Plan figur').check()
  await d.getByLabel('Figur', { exact: true }).selectOption('hexagon')
  await expect(d.getByLabel('Forhåndsvisning av figuren')).toBeVisible()
  const scrolled = await page.evaluate(() => window.scrollY)
  await d.getByRole('button', { name: 'Lagre oppgave' }).click()

  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Oppgaven er lagt til på nivå 2.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Oppgaver i nivå 1' })).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled)
  await expect(page.getByText('Alle endringer er lagret')).toBeVisible()

  await page.getByRole('tab', { name: /Nivå 2/ }).click()
  await expect(page.getByText('Se på figuren. Hvor mange hjørner har figuren?')).toBeVisible()
  // Kortet viser at appen retter svaret selv (ett tall).
  await expect(page.getByText('Appen retter svaret: 6')).toBeVisible()
  expect(errors).toEqual([])
})

test('8. «Lag selv» kan også lage et regnestykke, og «Avbryt» lukker uten å lagre', async ({ page }) => {
  await open(page)
  const before = await page.getByRole('heading', { name: /^Oppgave \d+$/ }).count()
  await page.getByRole('button', { name: 'Legg til oppgaver' }).click()
  const d = dialog(page)
  await d.getByRole('tab', { name: 'Lag selv' }).click()
  await d.getByLabel('Tall 1').fill('7')
  await d.getByLabel('Regneart').selectOption('*')
  await d.getByLabel('Tall 2').fill('8')
  await d.getByRole('button', { name: 'Avbryt' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /^Oppgave \d+$/ })).toHaveCount(before)

  await page.getByRole('button', { name: 'Legg til oppgaver' }).click()
  await d.getByRole('tab', { name: 'Lag selv' }).click()
  await d.getByLabel('Tall 1').fill('7')
  await d.getByLabel('Regneart').selectOption('*')
  await d.getByLabel('Tall 2').fill('8')
  await d.getByRole('button', { name: 'Lagre oppgave' }).click()
  await expect(page.getByRole('heading', { name: /^Oppgave \d+$/ })).toHaveCount(before + 1)
  await expect(page.getByText('Fasit: 7 · 8 = 56')).toBeVisible()
})

test('9. «Lag med AI» har de samme valgene og kontrollene som før', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Legg til oppgaver' }).click()
  const panel = dialog(page).getByRole('tabpanel')
  // Kompetansemål-feltet er fjernet (AI-en kobler ikke oppgavene til kompetansemål).
  await expect(panel.getByLabel('Kompetansemål (valgfritt)')).toHaveCount(0)
  await expect(panel.getByLabel('Andre ønsker (valgfritt)')).toBeVisible()
  for (const level of [1, 2, 3]) await expect(panel.getByLabel(`Nivå ${level}`)).toBeChecked()
  await expect(panel.getByLabel('Antall per nivå')).toHaveValue('2')
  await expect(panel).toContainText('merket som AI-generert og ikke gjennomgått')
  // Antallet valideres som før, uten at noe sendes til AI-en.
  // (Tallfeltet har min=1, så nettleseren stopper 0 selv; et tomt felt går til appens egen kontroll.)
  await panel.getByLabel('Antall per nivå').fill('')
  await panel.getByRole('button', { name: 'Lag oppgaver' }).click()
  await expect(panel.getByRole('alert')).toHaveText('Antall oppgaver må være et positivt heltall.')
  for (const level of [1, 2, 3]) await panel.getByLabel(`Nivå ${level}`).uncheck()
  await expect(panel.getByRole('alert')).toHaveText('Velg minst ett nivå.')
  // «Avbryt» lukker popupen.
  await panel.getByRole('button', { name: 'Avbryt' }).click()
  await expect(dialog(page)).toHaveCount(0)
})
