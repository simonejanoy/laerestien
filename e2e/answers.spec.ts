import { expect, test, type Page } from '@playwright/test'

// Elevvisningen: strukturerte svarfelt (regnestykker med ferdige regnetegn, én tallboks), umiddelbar tilbakemelding,
// nytt forsøk etter feil, og åpne svar som sendes til læreren. Til slutt: læreren ser svarene i øktvisningen.
// Testsiden viser grunnoppgavene uten innlogging og uten Firebase (se e2e/harness.tsx og e2e/liveHarness.tsx).

const student = (okt: string, niva: number, oppgave: number) => `/e2e/harness.html?okt=${okt}&niva=${niva}&visning=elev&oppgave=${oppgave}`

async function open(page: Page, url: string) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(url)
  return errors
}

/**
 * Lager en divisjonsoppgave med «Lag selv» (Tall og plassverdi, nivå 1) og åpner den i lærerens forhåndsvisning – den
 * samme elevvisningen. Utenfor Multiplikasjon får den de generelle regnestykkefeltene med ferdige regnetegn fra fasiten.
 */
async function divisionTaskInPreview(page: Page) {
  const errors = await open(page, '/e2e/harness.html?visning=okt&rolle=laerer&okt=okt-1-2&side=rediger')
  await page.getByRole('button', { name: 'Legg til oppgaver' }).click()
  const dialog = page.getByRole('dialog', { name: 'Legg til oppgaver' })
  await dialog.getByRole('tab', { name: 'Lag selv' }).click()
  await dialog.getByLabel('Tekstoppgave').check()
  await dialog.getByLabel('Oppgavetekst').fill('Skriv ett gangestykke og ett divisjonsstykke som hører sammen.')
  await dialog.getByLabel('Fasit eller løsningsforslag').fill('3 · 6 = 18 og 18 : 3 = 6')
  await dialog.getByRole('button', { name: 'Lagre oppgave' }).click()
  await page.getByRole('button', { name: 'Forhåndsvis' }).click()
  const next = page.getByRole('button', { name: 'Neste oppgave' })
  while (await next.isEnabled()) await next.click()
  await expect(page.getByRole('heading', { name: 'Skriv ett gangestykke og ett divisjonsstykke som hører sammen.' })).toBeVisible()
  return errors
}

test('5. regnestykker utenfor Multiplikasjon: regnetegnene står ferdig, og eleven skriver bare tall i små bokser', async ({ page }) => {
  const errors = await divisionTaskInPreview(page)
  const rows = page.getByRole('list', { name: 'Regnestykkene dine' })
  await expect(rows).toBeVisible()
  const times = rows.getByRole('listitem', { name: 'Regnestykke 1 med gange' })
  const division = rows.getByRole('listitem', { name: 'Regnestykke 2 med deling' })
  await expect(times).toContainText('·')
  await expect(times).toContainText('=')
  await expect(division).toContainText(':')
  await expect(times.getByRole('textbox')).toHaveCount(3)
  await expect(division.getByRole('textbox')).toHaveCount(3)
  await expect(page.getByRole('radio')).toHaveCount(0)
  await expect(page.getByLabel('Ditt svar')).toHaveCount(0)
  // Bare tall: bokstaver og tegn forsvinner.
  const first = times.getByLabel('Regnestykke 1 med gange, tall 1')
  await first.fill('6a+')
  await expect(first).toHaveValue('6')
  await expect(first).toHaveAttribute('inputmode', 'numeric')
  expect(errors).toEqual([])
})

test('1 og 2. feil svar gir «Ikke helt – prøv igjen» uten fasit, og byttede faktorer godtas på nytt forsøk', async ({ page }) => {
  await divisionTaskInPreview(page)
  const fill = async (values: string[]) => {
    const boxes = page.getByRole('list', { name: 'Regnestykkene dine' }).getByRole('textbox')
    for (let i = 0; i < values.length; i++) await boxes.nth(i).fill(values[i])
  }
  await fill(['3', '6', '18', '18', '3', '5'])
  await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Ikke helt – prøv igjen.' })).toBeVisible()
  // Fasiten vises ikke før eleven har levert.
  await expect(page.getByText('Riktig svar:')).toHaveCount(0)

  // Nytt forsøk: 6 · 3 = 18 er like riktig som 3 · 6 = 18.
  await fill(['6', '3', '18', '18', '3', '6'])
  await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Riktig!' })).toBeVisible()
})

test('1. ett tall som svar: én tallboks, «Riktig!» etter nytt forsøk', async ({ page }) => {
  // Geometri økt 1, nivå 1, oppgave 3: «Hvor mange sider har en sekskant?» (fasit «6 sider»).
  await open(page, student('geometri-1', 1, 2))
  const box = page.getByLabel('Ditt svar')
  await expect(box).toHaveAttribute('inputmode', 'numeric')
  await box.fill('5')
  await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Ikke helt – prøv igjen.' })).toBeVisible()
  await box.fill('6')
  await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Riktig!' })).toBeVisible()
})

test('4. åpne svar rettes ikke: de sendes til læreren, og eleven kan gå videre', async ({ page }) => {
  // Geometri økt 1, nivå 1, oppgave 1: to spørsmål i én oppgave – ikke ett entydig svar.
  await open(page, student('geometri-1', 1, 0))
  await page.getByLabel('Ditt svar').fill('3 hjørner og 3 sider')
  await expect(page.getByRole('button', { name: 'Sjekk svaret mitt' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Send til læreren' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Svaret er sendt til læreren.' })).toBeVisible()
  await expect(page.getByText('Riktig!')).toHaveCount(0)
  await expect(page.getByText('Ikke helt')).toHaveCount(0)
  await page.getByRole('button', { name: 'Neste oppgave' }).click()
  await expect(page.getByText('Oppgave 2', { exact: true })).toBeVisible()
})

test('3. elevens svar og resultat kommer fram i lærerens øktvisning', async ({ context }) => {
  const teacher = await context.newPage()
  const pupil = await context.newPage()
  await teacher.goto('/e2e/harness.html?visning=okt&rolle=laerer&okt=okt-1-2')
  await pupil.goto('/e2e/harness.html?visning=okt&rolle=elev&okt=okt-1-2')
  await teacher.getByRole('button', { name: 'Start økt' }).click()
  await expect(pupil.getByRole('navigation', { name: 'Bla mellom oppgavene' })).toContainText('Oppgave 1 av')

  // Første forsøk feil, andre riktig.
  const answers = await pupil.evaluate(() => (window as unknown as { studentAnswers: (number | null)[] }).studentAnswers)
  await pupil.getByLabel('Ditt svar').fill(String((answers[0] ?? 0) + 1))
  await pupil.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
  await expect(pupil.getByRole('heading', { name: 'Ikke helt – prøv igjen.' })).toBeVisible()
  await pupil.getByRole('button', { name: /Prøv selv/ }).click()
  await pupil.getByLabel('Ditt svar').fill(String(answers[0]))
  await pupil.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
  await expect(pupil.getByRole('status').filter({ hasText: 'Riktig!' })).toBeVisible()

  const row = teacher.locator('li[data-student="Nora Lie"]')
  await expect(row.getByLabel('Oppgave 1: riktig')).toBeVisible()
  await row.getByText('Se svarene til Nora Lie').click()
  const list = row.getByRole('list', { name: 'Leverte svar fra Nora Lie' })
  await expect(list).toContainText('Oppgave 1 · Riktig · 2 forsøk')
  await expect(list).toContainText(`= ${answers[0]}`)
})
