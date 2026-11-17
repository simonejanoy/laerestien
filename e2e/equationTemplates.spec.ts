import { expect, test, type Locator, type Page } from '@playwright/test'
import { buildTasks, planned } from '../src/features/sessions/sessionTasks.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'

// Regnestykke-malene i Multiplikasjon (økt 1): tallbokser og regnetegnknapper i stedet for ett stort skrivefelt, flere
// ledd i pluss-linjen, og automatisk retting ut fra figuren – i elevvisningen og i lærerens forhåndsvisning.

const SESSION = 'multiplikasjon-1'
const tasks = [...(worksheetTasks[SESSION] ?? []), ...buildTasks(planned('multiplikasjon')[0])].filter((t) => t.level === 1)
const pictureIndex = tasks.findIndex((t) => t.kind === 'text' && t.text.startsWith('Se på figuren. Lag to regnestykker') && t.figure?.kind === 'grid' && t.figure.rows.length === 2)
const sumIndex = tasks.findIndex((t) => t.kind === 'text' && t.text.startsWith('Skriv som gangestykke'))

async function open(page: Page, index: number, visning: 'elev' | 'forhandsvisning') {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`/e2e/harness.html?okt=${SESSION}&niva=1&visning=${visning}&oppgave=${index}`)
  return errors
}

const lineOf = (page: Page, kind: 'plus' | 'times') => page.locator(`li[data-line="${kind}"]`)
const box = (line: Locator, label: string) => line.getByLabel(label, { exact: true })

async function fillLine(page: Page, kind: 'plus' | 'times', terms: string[], sign: 'pluss' | 'gange', result: string) {
  const line = lineOf(page, kind)
  const name = kind === 'plus' ? 'Med pluss' : 'Med gange'
  for (const [k, value] of terms.entries()) {
    if (k >= 2 && (await line.getByRole('textbox').count()) < k + 2) await line.getByRole('button', { name: 'legg til tall' }).click()
    const input = box(line, `${name}: tall ${k + 1}`)
    await input.click()
    await page.keyboard.type(value)
    await expect(input).toHaveValue(value)
  }
  await line.getByRole('radio', { name: sign }).click()
  await expect(line.getByRole('radio', { name: sign })).toHaveAttribute('aria-checked', 'true')
  await box(line, `${name}: svar`).fill(result)
}

for (const visning of ['elev', 'forhandsvisning'] as const) {
  test.describe(`Multiplikasjon – ${visning}`, () => {
    test('figur 2 × 4: skrive i boksene, velge regnetegn, legge til og fjerne ledd, og få «Riktig!»', async ({ page }) => {
      expect(pictureIndex).toBeGreaterThanOrEqual(0)
      const errors = await open(page, pictureIndex, visning)
      await expect(page.getByText('Med pluss', { exact: true })).toBeVisible()
      await expect(page.getByText('Med gange', { exact: true })).toBeVisible()
      // Det store skrivefeltet er borte.
      await expect(page.getByLabel('Ditt svar')).toHaveCount(0)
      const check = page.getByRole('button', { name: 'Sjekk svaret mitt' })
      await expect(check).toBeDisabled()

      // Legg til og fjern ledd: 2 bokser → 3 → 2.
      const plus = lineOf(page, 'plus')
      const termBoxes = plus.getByLabel(/^Med pluss: tall \d+$/)
      await expect(termBoxes).toHaveCount(2)
      await expect(plus.getByRole('button', { name: 'fjern tall' })).toBeDisabled()
      await plus.getByRole('button', { name: 'legg til tall' }).click()
      await expect(termBoxes).toHaveCount(3)
      await plus.getByRole('button', { name: 'fjern tall' }).click()
      await expect(termBoxes).toHaveCount(2)

      // 2 + 2 + 2 + 2 = 8 og 4 · 2 = 8. Bare tall i boksene.
      await fillLine(page, 'plus', ['2', '2', '2', '2'], 'pluss', '8')
      await box(plus, 'Med pluss: tall 1').fill('2x')
      await expect(box(plus, 'Med pluss: tall 1')).toHaveValue('2')
      await fillLine(page, 'times', ['4', '2'], 'gange', '8')
      await expect(check).toBeEnabled()
      await check.click()

      await expect(page.getByRole('status').filter({ hasText: 'Riktig!' })).toBeVisible()
      await expect(plus).toContainText('Riktig.')
      await expect(lineOf(page, 'times')).toContainText('Riktig.')
      expect(errors).toEqual([])
    })

    test('hver linje rettes for seg: «Ikke riktig.», ett nytt forsøk, og «Riktig!»', async ({ page }) => {
      const errors = await open(page, pictureIndex, visning)
      await fillLine(page, 'plus', ['4', '4'], 'pluss', '8')
      // Feil regnetegn i gange-linjen.
      await fillLine(page, 'times', ['2', '4'], 'pluss', '8')
      await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
      await expect(lineOf(page, 'plus')).toContainText('Riktig.')
      await expect(lineOf(page, 'times')).toContainText('Ikke riktig.')
      await expect(page.getByText('Ikke riktig. Prøv én gang til.')).toBeVisible()
      // Riktig linje er låst; den andre rettes.
      await expect(box(lineOf(page, 'plus'), 'Med pluss: tall 1')).toHaveAttribute('readonly', '')
      await lineOf(page, 'times').getByRole('radio', { name: 'gange' }).click()
      await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Riktig!' })).toBeVisible()
      expect(errors).toEqual([])
    })

    test('feil to ganger: eksempel på riktig svar', async ({ page }) => {
      await open(page, pictureIndex, visning)
      await fillLine(page, 'plus', ['3', '5'], 'pluss', '8')
      await fillLine(page, 'times', ['1', '8'], 'gange', '8')
      const check = page.getByRole('button', { name: 'Sjekk svaret mitt' })
      await check.click()
      await box(lineOf(page, 'times'), 'Med gange: svar').fill('9')
      await check.click()
      await expect(lineOf(page, 'plus')).toContainText('Eksempel på riktig svar: 4 + 4 = 8')
      await expect(lineOf(page, 'times')).toContainText('Eksempel på riktig svar: 2 · 4 = 8')
    })

    test('«Skriv som gangestykke» med plusstykke: én gange-linje som rettes', async ({ page }) => {
      expect(sumIndex).toBeGreaterThanOrEqual(0)
      const task = tasks[sumIndex]
      const [groups, size] = task.kind === 'text' ? [task.text.split('+').length, Number(/(\d+)\s*\+/.exec(task.text)![1])] : [0, 0]
      await open(page, sumIndex, visning)
      await expect(lineOf(page, 'plus')).toHaveCount(0)
      await expect(page.getByLabel('Ditt svar')).toHaveCount(0)
      await fillLine(page, 'times', [String(groups), String(size)], 'gange', String(groups * size))
      await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Riktig!' })).toBeVisible()
    })
  })
}

for (const viewport of [
  { name: 'iPad', width: 820, height: 1180 },
  { name: 'mobil', width: 390, height: 844 },
]) {
  test(`malene får plass og kan brukes på ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await open(page, pictureIndex, 'elev')
    await fillLine(page, 'plus', ['2', '2', '2', '2'], 'pluss', '8')
    await fillLine(page, 'times', ['2', '4'], 'gange', '8')
    // Linjene brytes innenfor oppgavekortet i stedet for å gå ut over kanten.
    for (const kind of ['plus', 'times'] as const) {
      const overflow = await lineOf(page, kind).evaluate((el) => {
        const card = el.closest('section')!.getBoundingClientRect()
        return [...el.querySelectorAll('input, button')].some((c) => c.getBoundingClientRect().right > card.right + 1)
      })
      expect(overflow).toBe(false)
    }
    await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Riktig!' })).toBeVisible()
  })
}
