import { expect, test, type Locator, type Page } from '@playwright/test'
import { buildTasks, evenLevels, mergeTasks, planned } from '../src/features/sessions/sessionTasks.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'

// Regnestykke-malene i Multiplikasjon (økt 1): tallbokser i stedet for ett stort skrivefelt, flere ledd i pluss-linjen,
// og automatisk retting ut fra figuren – i elevvisningen og i lærerens forhåndsvisning. Oppgavene her bestemmer selv
// regnearten («ett med pluss og ett med gange», «Skriv som gangestykke»), så regnetegnet står ferdig og låst, og eleven
// skriver bare tall. (At eleven velger regnetegnet når oppgaven ikke bestemmer regnearten, testes i
// server/equationTemplates.test.ts.)

const SESSION = 'multiplikasjon-1'
// Oppgavene på nivå 1 slik eleven får dem (fem per nivå, som i SessionsProvider og testsiden).
const tasks = evenLevels(mergeTasks(worksheetTasks[SESSION] ?? [], buildTasks(planned('multiplikasjon')[0]))).filter((t) => t.level === 1)
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
  // Regnetegnet er ferdig utfylt og låst: ingen knapper å velge, bare tallene.
  await expect(line.getByRole('radio')).toHaveCount(0)
  await expect(line.getByLabel(`${name}: regnetegnet er ${sign}`).first()).toBeVisible()
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

    test('«ett med pluss og ett med gange»: regnetegnene står ferdig og låst, også mellom nye ledd', async ({ page }) => {
      const errors = await open(page, pictureIndex, visning)
      const plus = lineOf(page, 'plus')
      const times = lineOf(page, 'times')
      await expect(page.getByRole('radio')).toHaveCount(0)
      await expect(plus.locator('[data-fixed-operator]')).toHaveText(['+'])
      await expect(times.locator('[data-fixed-operator]')).toHaveText(['·'])
      // Flere ledd: hvert nye ledd får et låst pluss foran seg.
      await plus.getByRole('button', { name: 'legg til tall' }).click()
      await plus.getByRole('button', { name: 'legg til tall' }).click()
      await expect(plus.locator('[data-fixed-operator]')).toHaveText(['+', '+', '+'])
      await expect(plus).toContainText('=')
      expect(errors).toEqual([])
    })

    test('hver linje rettes for seg: «Ikke riktig.», ett nytt forsøk, og «Riktig!»', async ({ page }) => {
      const errors = await open(page, pictureIndex, visning)
      await fillLine(page, 'plus', ['4', '4'], 'pluss', '8')
      // Feil tall i gange-linjen (regnetegnet kan ikke være feil – det er låst).
      await fillLine(page, 'times', ['2', '3'], 'gange', '8')
      await page.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
      await expect(lineOf(page, 'plus')).toContainText('Riktig.')
      await expect(lineOf(page, 'times')).toContainText('Ikke riktig.')
      await expect(page.getByText('Ikke helt – prøv igjen.')).toBeVisible()
      // Riktig linje er låst; den andre rettes.
      await expect(box(lineOf(page, 'plus'), 'Med pluss: tall 1')).toHaveAttribute('readonly', '')
      await box(lineOf(page, 'times'), 'Med gange: tall 2').fill('4')
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
