import { expect, test, type Page } from '@playwright/test'
import type { QuestionPart } from '../src/ai/patternDisplay.ts'
import { buildTasks, planned } from '../src/features/sessions/sessionTasks.ts'

// Inputboksene i Regning (tomme ruter i tabeller og □ i likninger) og tallrekkene i Mønster og algoritmer, i en ekte
// nettleser – både i elevvisningen og i lærerens forhåndsvisning. Feilen dette fanger: boksene i Regning fikk fokus,
// men tallet eleven skrev forsvant (boksnummeret ble delt ut mens boksene ble tegnet, og React tegner flere ganger).

const VIEWS = ['elev', 'forhandsvisning'] as const

async function open(page: Page, okt: string, niva: number, visning: string) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`/e2e/harness.html?okt=${okt}&niva=${niva}&visning=${visning}`)
  return errors
}

/** Klikker i hver boks og skriver tallet, og sjekker at tallet faktisk står i boksen. */
async function typeInBoxes(page: Page, values: string[]) {
  const boxes = page.locator('section input[inputmode="numeric"]')
  await expect(boxes).toHaveCount(values.length)
  for (const [i, value] of values.entries()) {
    await boxes.nth(i).click()
    await expect(boxes.nth(i)).toBeFocused()
    await page.keyboard.type(value)
    await expect(boxes.nth(i)).toHaveValue(value)
  }
}

for (const visning of VIEWS) {
  test.describe(`Regning – ${visning}`, () => {
    test('tabell med tomme ruter: 10 og 7 skrives i rutene og gir «Riktig!»', async ({ page }) => {
      const errors = await open(page, 'regning-2', 3, visning)
      await expect(page.getByRole('table')).toBeVisible()
      await typeInBoxes(page, ['10', '7'])
      // Skrivefeltet under er bare for forklaringen.
      await expect(page.getByLabel('Forklar hvordan du tenkte')).toBeVisible()
      await expect(page.getByLabel('Ditt svar')).toHaveCount(0)
      await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
      await expect(page.getByRole('status').first()).toContainText('Riktig!')
      expect(errors).toEqual([])
    })

    test('«□ + 5 = 18»: 13 skrives der □ står og gir «Riktig!»', async ({ page }) => {
      const errors = await open(page, 'regning-5', 1, visning)
      await expect(page.locator('section')).toContainText('+ 5 = 18')
      await expect(page.getByLabel('Tallet som mangler, nr. 1')).toBeVisible()
      await typeInBoxes(page, ['13'])
      await expect(page.getByLabel('Ditt svar')).toHaveCount(0)
      await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
      await expect(page.getByRole('status').first()).toContainText('Riktig!')
      expect(errors).toEqual([])
    })

    test('«20 + 4 = □ + 3»: tallet skrives i boksen på høyre side, og feil svar gir et nytt forsøk', async ({ page }) => {
      const errors = await open(page, 'regning-6', 1, visning)
      await expect(page.locator('section')).toContainText('20 + 4 =')
      await typeInBoxes(page, ['20'])
      await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
      await expect(page.getByRole('status').first()).toContainText('Ikke helt – prøv igjen.')
      const box = page.locator('section input[inputmode="numeric"]')
      await box.fill('')
      await box.click()
      await page.keyboard.type('21')
      await expect(box).toHaveValue('21')
      await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
      await expect(page.getByRole('status').first()).toContainText('Riktig!')
      expect(errors).toEqual([])
    })
  })

  test(`Mønster og algoritmer – ${visning}: tallrekke-boksene tar imot tall`, async ({ page }) => {
    const errors = await open(page, 'monster-og-algoritmer-2', 1, visning)
    const boxes = page.locator('section input[inputmode="numeric"]')
    const count = await boxes.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      await boxes.nth(i).click()
      await page.keyboard.type(String(i + 1))
      await expect(boxes.nth(i)).toHaveValue(String(i + 1))
    }
    expect(errors).toEqual([])
  })
}

// Oppgaver med flere spørsmål i Regning: ett svarfelt per spørsmål (tallboks, fire regnetegnknapper eller knapper med
// navnene i diagrammet eller tabellen), rettet hver for seg. Svarene hentes fra grunnoppgavene i økta.

const OPERATOR_NAMES: Record<string, string> = { '+': 'pluss', '−': 'minus', '·': 'gange', ':': 'dele' }

/** Spørsmålene og svarene i den første oppgaven på nivået. */
function partsOf(okt: string, niva: number): QuestionPart[] {
  const task = buildTasks(planned('regning').find((s) => s.id === okt)!).find((t) => t.level === niva)!
  if (task.kind !== 'text' || task.expected?.kind !== 'parts') throw new Error(`${okt} nivå ${niva} har ikke svardeler`)
  return task.expected.parts
}

/** Svarer på hvert spørsmål: trykker på en knapp eller skriver i tallboksen under spørsmålet. */
async function answerParts(page: Page, parts: QuestionPart[], wrong: number[] = []) {
  for (const [i, part] of parts.entries()) {
    const group = page.locator('section ol > li').filter({ hasText: part.question })
    await expect(group).toHaveCount(1)
    const { answer } = part
    if (answer.kind === 'number') {
      const box = group.getByRole('textbox')
      await box.click()
      const value = String(wrong.includes(i) ? answer.value + 1 : answer.value)
      await page.keyboard.type(value)
      await expect(box).toHaveValue(value)
    } else {
      const options = group.getByRole('radio')
      const name = answer.kind === 'operator' ? OPERATOR_NAMES[answer.value] : answer.value
      const button = wrong.includes(i) ? options.filter({ hasNotText: answer.value }).first() : group.getByRole('radio', { name, exact: true })
      await button.click()
      await expect(button).toHaveAttribute('aria-checked', 'true')
    }
  }
}

for (const visning of VIEWS) {
  test.describe(`Regning med flere spørsmål – ${visning}`, () => {
    for (const [title, okt, niva] of [
      ['«Hvilken regneart passer? Hvor mange …?»: regnetegnknapp og tallboks', 'regning-3', 1],
      ['diagram: tallboks og knapp med navnet fra diagrammet', 'regning-1', 1],
      ['tabell: tallboks og knapp med navnet fra tabellen', 'regning-2', 1],
      ['«Hvilken regneart passer?» med forklaring', 'regning-4', 2],
    ] as const) {
      test(`${title} gir «Riktig!»`, async ({ page }) => {
        const errors = await open(page, okt, niva, visning)
        const parts = partsOf(okt, niva)
        // Spørsmålene står over svarfeltene, ikke i teksten, og det store skrivefeltet er borte.
        await expect(page.getByLabel('Ditt svar')).toHaveCount(0)
        await answerParts(page, parts)
        await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
        await expect(page.getByRole('status').first()).toContainText('Riktig!')
        expect(errors).toEqual([])
      })
    }

    test('hver del rettes for seg: feil tall og riktig navn gir «Ikke riktig.» og «Riktig.», og et nytt forsøk', async ({ page }) => {
      const errors = await open(page, 'regning-1', 1, visning)
      const parts = partsOf('regning-1', 1)
      await answerParts(page, parts, [0])
      await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
      const groups = page.locator('section ol > li')
      await expect(groups.filter({ hasText: parts[0].question })).toContainText('Ikke riktig.')
      await expect(groups.filter({ hasText: parts[1].question })).toContainText('Riktig.')
      await expect(page.getByRole('status').first()).toContainText('Ikke helt – prøv igjen.')
      const box = groups.filter({ hasText: parts[0].question }).getByRole('textbox')
      await box.fill('')
      await box.click()
      await page.keyboard.type(String((parts[0].answer as { value: number }).value))
      await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
      await expect(page.getByRole('status').first()).toContainText('Riktig!')
      expect(errors).toEqual([])
    })
  })
}
