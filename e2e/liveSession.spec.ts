import { expect, test, type Page } from '@playwright/test'
import { roster } from '../src/features/class/roster.ts'

// Hele flyten i to faner i samme nettleser: læreren starter økta, Amalie venter og får oppgavene av seg selv, leverer,
// og lærerens «Følg elevenes arbeid» oppdateres uten omlasting. De ekte sidene brukes, med en lokal backend i stedet
// for Firebase (se e2e/liveHarness.tsx og src/features/live/localLiveBackend.ts).

const SESSION = 'okt-1-2'
const url = (rolle: 'laerer' | 'elev') => `/e2e/harness.html?visning=okt&rolle=${rolle}&okt=${SESSION}`

async function open(page: Page, rolle: 'laerer' | 'elev') {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(url(rolle))
  return errors
}

const amalieRow = (teacher: Page) => teacher.locator('li[data-student="Amalie Berg"]')
const amalieBar = (teacher: Page) => teacher.getByRole('progressbar', { name: 'Framdrift for Amalie Berg' })
const studentNav = (student: Page) => student.getByRole('navigation', { name: 'Bla mellom oppgavene' })

/** Går til oppgave nr. `index` (0-basert) med pilene øverst og leverer riktig svar. */
async function deliver(student: Page, index: number) {
  const answers = await student.evaluate(() => (window as unknown as { amalieAnswers: (number | null)[] }).amalieAnswers)
  const nav = studentNav(student)
  for (let i = 0; i < 20; i++) {
    const current = Number((await nav.textContent())?.match(/Oppgave (\d+) av/)?.[1] ?? Infinity) - 1
    if (current === index) break
    await nav.getByRole('button', { name: current > index ? 'Forrige oppgave' : 'Neste oppgave' }).click()
  }
  await expect(nav).toContainText(`Oppgave ${index + 1} av`)
  await student.getByLabel('Ditt svar').fill(String(answers[index]))
  await student.getByRole('button', { name: 'Sjekk svaret mitt' }).click()
  await expect(student.getByAltText('Riktig')).toBeVisible()
}

async function otherStudentsAtZero(teacher: Page) {
  const others = roster.filter((s) => s.name !== 'Amalie Berg')
  for (const s of others) await expect(teacher.getByRole('progressbar', { name: `Framdrift for ${s.name}` })).toHaveAttribute('aria-valuenow', '0')
}

test('lærer starter økta, Amalie leverer, læreren følger med og avslutter', async ({ context }) => {
  const teacher = await context.newPage()
  const student = await context.newPage()
  const errors = [...(await open(teacher, 'laerer')), ...(await open(student, 'elev'))]

  // Før start: læreren ser at økta bare er planlagt, Amalie venter og ser ingen oppgaver.
  await expect(teacher.getByTestId('okt-status')).toHaveText('Planlagt – ikke startet')
  await expect(student.getByRole('heading', { name: 'Venter på læreren' })).toBeVisible()
  await expect(student.getByText('Venter på at læreren skal starte økten.', { exact: false })).toBeVisible()
  await expect(student.getByLabel('Ditt svar')).toHaveCount(0)
  await expect(amalieRow(teacher)).toContainText('Venter')

  // Læreren starter: Amalie får oppgavene av seg selv, uten å logge inn på nytt.
  await teacher.getByRole('button', { name: 'Start økt' }).click()
  await expect(teacher.getByTestId('okt-status')).toHaveText('Økten er i gang')
  await expect(studentNav(student)).toContainText('Oppgave 1 av')
  const total = (await student.evaluate(() => (window as unknown as { amalieAnswers: unknown[] }).amalieAnswers)).length
  expect(total).toBeGreaterThanOrEqual(4)
  await expect(amalieRow(teacher)).toContainText(`Ikke startet · 0 av ${total} levert`)
  await expect(amalieBar(teacher)).toHaveAttribute('aria-valuenow', '0')
  await otherStudentsAtZero(teacher)

  // Å bla forbi en oppgave uten å levere øker ikke framdriften.
  await studentNav(student).getByRole('button', { name: 'Neste oppgave' }).click()
  await expect(studentNav(student)).toContainText('Oppgave 2 av')
  await studentNav(student).getByRole('button', { name: 'Forrige oppgave' }).click()
  await expect(amalieBar(teacher)).toHaveAttribute('aria-valuenow', '0')

  // Amalie leverer tre oppgaver – læreren ser det uten å laste siden på nytt.
  for (const i of [0, 1, 2]) await deliver(student, i)
  const third = String(Math.round((3 / total) * 100))
  await expect(amalieBar(teacher)).toHaveAttribute('aria-valuenow', third)
  await expect(amalieRow(teacher)).toContainText(`Pågår · 3 av ${total} levert`)
  await expect(amalieRow(teacher).getByLabel('Oppgave 1: riktig')).toBeVisible()
  await otherStudentsAtZero(teacher)

  // Omlasting: svarene og framdriften er der fortsatt hos begge.
  await student.reload()
  await expect(studentNav(student)).toContainText(`3 av ${total} levert`)
  await teacher.reload()
  await expect(teacher.getByTestId('okt-status')).toHaveText('Økten er i gang')
  await expect(amalieRow(teacher)).toContainText(`Pågår · 3 av ${total} levert`)

  // Resten leveres: 100 % og «Fullført».
  for (let i = 3; i < total; i++) await deliver(student, i)
  await expect(amalieBar(teacher)).toHaveAttribute('aria-valuenow', '100')
  await expect(amalieRow(teacher)).toContainText(`Fullført · ${total} av ${total} levert`)
  await otherStudentsAtZero(teacher)

  // Læreren avslutter: Amalie får beskjed og kan ikke levere mer. Resultatene står igjen hos læreren.
  await teacher.getByRole('button', { name: 'Avslutt økt' }).click()
  await expect(teacher.getByTestId('okt-status')).toHaveText('Økten er avsluttet')
  await expect(student.getByRole('heading', { name: 'Økten er avsluttet' })).toBeVisible()
  await expect(student.getByRole('button', { name: 'Sjekk svaret mitt' })).toHaveCount(0)
  await expect(amalieRow(teacher)).toContainText(`Fullført · ${total} av ${total} levert`)

  // Ny økt: starter på 0 % for alle – ingenting arves fra forrige gjennomføring.
  await teacher.getByRole('button', { name: 'Start økten på nytt' }).click()
  await expect(teacher.getByTestId('okt-status')).toHaveText('Økten er i gang')
  await expect(amalieBar(teacher)).toHaveAttribute('aria-valuenow', '0')
  await expect(studentNav(student)).toContainText(`0 av ${total} levert`)

  expect(errors).toEqual([])
})
