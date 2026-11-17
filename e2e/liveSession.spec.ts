import { expect, test, type Page } from '@playwright/test'
import { roster } from '../src/features/class/roster.ts'
import { serializeTaskSets } from '../src/features/sessions/taskStorage.ts'
import type { SessionTask } from '../src/types/index.ts'

// Hele flyten i to faner i samme nettleser: læreren starter økta, Nora (nivå 3) venter og får oppgavene av seg selv, leverer,
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

const noraRow = (teacher: Page) => teacher.locator('li[data-student="Nora Lie"]')
const noraBar = (teacher: Page) => teacher.getByRole('progressbar', { name: 'Framdrift for Nora Lie' })
const studentNav = (student: Page) => student.getByRole('navigation', { name: 'Bla mellom oppgavene' })

/** Går til oppgave nr. `index` (0-basert) med pilene øverst og leverer riktig svar. */
async function deliver(student: Page, index: number) {
  const answers = await student.evaluate(() => (window as unknown as { studentAnswers: (number | null)[] }).studentAnswers)
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

/** «Multiplikasjon økt 7»: navnet på økta slik lærersiden viser den («Multiplikasjon · Klasse 4A · …»). */
async function sessionName(teacher: Page) {
  const name = await teacher.evaluate(() => (window as unknown as { sessionName: string }).sessionName)
  expect(name).toMatch(/ økt \d/)
  return name
}

async function otherStudentsAtZero(teacher: Page) {
  const others = roster.filter((s) => s.name !== 'Nora Lie')
  for (const s of others) await expect(teacher.getByRole('progressbar', { name: `Framdrift for ${s.name}` })).toHaveAttribute('aria-valuenow', '0')
}

test('lærer starter økta, Nora leverer nivå 3-oppgaver, læreren følger med og avslutter', async ({ context }) => {
  const teacher = await context.newPage()
  const student = await context.newPage()
  const errors = [...(await open(teacher, 'laerer')), ...(await open(student, 'elev'))]

  // Før start: læreren ser at økta bare er planlagt, Nora venter og ser ingen oppgaver.
  await expect(teacher.getByTestId('okt-status')).toHaveText('Planlagt – ikke startet')
  await expect(student.getByTestId('tavle-waiting')).toBeVisible()
  await expect(student.getByRole('heading', { name: 'Venter på at læreren skal starte økten' })).toBeVisible()
  await expect(student.getByLabel('Ditt svar')).toHaveCount(0)
  await expect(noraRow(teacher)).toContainText('Venter')

  // Læreren starter: Nora får oppgavene av seg selv, uten å logge inn på nytt.
  await teacher.getByRole('button', { name: 'Start økt' }).click()
  await expect(teacher.getByTestId('okt-status')).toHaveText('Økten er i gang')
  await expect(studentNav(student)).toContainText('Oppgave 1 av')
  // Samme økt som læreren startet, med navnet øverst.
  await expect(student.getByRole('banner')).toContainText(await sessionName(teacher))
  const total = (await student.evaluate(() => (window as unknown as { studentAnswers: unknown[] }).studentAnswers)).length
  expect(total).toBeGreaterThanOrEqual(4)
  await expect(noraRow(teacher)).toContainText(`Ikke startet · 0 av ${total} levert`)
  await expect(noraBar(teacher)).toHaveAttribute('aria-valuenow', '0')
  await otherStudentsAtZero(teacher)

  // Å bla forbi en oppgave uten å levere øker ikke framdriften.
  await studentNav(student).getByRole('button', { name: 'Neste oppgave' }).click()
  await expect(studentNav(student)).toContainText('Oppgave 2 av')
  await studentNav(student).getByRole('button', { name: 'Forrige oppgave' }).click()
  await expect(noraBar(teacher)).toHaveAttribute('aria-valuenow', '0')

  // Nora leverer tre oppgaver – læreren ser det uten å laste siden på nytt.
  for (const i of [0, 1, 2]) await deliver(student, i)
  const third = String(Math.round((3 / total) * 100))
  await expect(noraBar(teacher)).toHaveAttribute('aria-valuenow', third)
  await expect(noraRow(teacher)).toContainText(`Pågår · 3 av ${total} levert`)
  await expect(noraRow(teacher).getByLabel('Oppgave 1: riktig')).toBeVisible()
  await otherStudentsAtZero(teacher)

  // Omlasting: svarene og framdriften er der fortsatt hos begge.
  await student.reload()
  await expect(studentNav(student)).toContainText(`3 av ${total} levert`)
  await teacher.reload()
  await expect(teacher.getByTestId('okt-status')).toHaveText('Økten er i gang')
  await expect(noraRow(teacher)).toContainText(`Pågår · 3 av ${total} levert`)

  // Resten leveres: 100 % og «Fullført».
  for (let i = 3; i < total; i++) await deliver(student, i)
  await expect(noraBar(teacher)).toHaveAttribute('aria-valuenow', '100')
  await expect(noraRow(teacher)).toContainText(`Fullført · ${total} av ${total} levert`)
  await otherStudentsAtZero(teacher)

  // Læreren avslutter: Nora får beskjed og kan ikke levere mer. Resultatene står igjen hos læreren.
  await teacher.getByRole('button', { name: 'Avslutt økt' }).click()
  await expect(teacher.getByTestId('okt-status')).toHaveText('Økten er avsluttet')
  await expect(student.getByTestId('tavle-ended')).toBeVisible()
  await expect(student.getByRole('heading', { name: 'Økten er avsluttet' })).toBeVisible()
  await expect(student.getByRole('button', { name: 'Sjekk svaret mitt' })).toHaveCount(0)
  await expect(noraRow(teacher)).toContainText(`Fullført · ${total} av ${total} levert`)

  // Ny økt: starter på 0 % for alle – ingenting arves fra forrige gjennomføring.
  await teacher.getByRole('button', { name: 'Start økten på nytt' }).click()
  await expect(teacher.getByTestId('okt-status')).toHaveText('Økten er i gang')
  await expect(noraBar(teacher)).toHaveAttribute('aria-valuenow', '0')
  await expect(studentNav(student)).toContainText(`0 av ${total} levert`)

  expect(errors).toEqual([])
})

test('økta mangler oppgaver på nivå 3: læreren får advarsel, og Nora får en melding i stedet for en tom side', async ({ context }) => {
  // Læreren har lagret et oppgavesett for økta med bare nivå 1 og 2 (samme lagring som «Rediger oppgavene»).
  const math = (id: string, level: 1 | 2): SessionTask => ({ id, level, type: 'Hoderegning', instruction: 'Regn ut.', a: 2, operator: '+', b: 3 })
  const saved = serializeTaskSets({ [SESSION]: [math('a', 1), math('b', 2)] })
  await context.addInitScript((value) => localStorage.setItem('laerestien:oppgavesett:v1', value), saved)

  const errors: string[] = []
  const sessionPage = await context.newPage()
  sessionPage.on('pageerror', (e) => errors.push(e.message))
  await sessionPage.goto(`/e2e/harness.html?visning=okt&rolle=okt-side&okt=${SESSION}`)
  const warning = sessionPage.getByTestId('mangler-niva')
  await expect(warning).toContainText('Økta har ingen oppgaver på nivå 3.')
  await expect(warning).toContainText('Nora Lie')
  await expect(sessionPage.getByRole('button', { name: 'Start økt' })).toBeVisible()

  const teacher = await context.newPage()
  const student = await context.newPage()
  errors.push(...(await open(teacher, 'laerer')), ...(await open(student, 'elev')))
  await expect(teacher.getByTestId('mangler-niva')).toContainText('nivå 3')
  await teacher.getByRole('button', { name: 'Start økt' }).click()
  await expect(teacher.getByTestId('okt-status')).toHaveText('Økten er i gang')
  // Advarselen står fortsatt mens økta er i gang.
  await expect(teacher.getByTestId('mangler-niva')).toContainText('Nora Lie')

  await expect(student.getByRole('heading', { name: 'Ingen oppgaver til deg ennå' })).toBeVisible()
  await expect(student.getByText('Økten har ingen oppgaver på nivå 3.', { exact: false })).toBeVisible()
  await expect(studentNav(student)).toHaveCount(0)
  await expect(noraRow(teacher)).toContainText('0 av 0 levert')
  expect(errors).toEqual([])
})

test('pause viser tavla «Følg med på læreren», og når læreren fortsetter, er Nora på samme oppgave', async ({ context }) => {
  const teacher = await context.newPage()
  const student = await context.newPage()
  const errors = [...(await open(teacher, 'laerer')), ...(await open(student, 'elev'))]
  await teacher.getByRole('button', { name: 'Start økt' }).click()
  await deliver(student, 0)
  await deliver(student, 2)
  await expect(studentNav(student)).toContainText('Oppgave 3 av')

  await teacher.getByRole('button', { name: 'Pause økt' }).click()
  await expect(student.getByTestId('tavle-paused')).toBeVisible()
  await expect(student.getByRole('heading', { name: 'Følg med på læreren' })).toBeVisible()
  await expect(student.getByLabel('Ditt svar')).toHaveCount(0)

  await teacher.getByRole('button', { name: 'Fortsett økt' }).click()
  await expect(studentNav(student)).toContainText('Oppgave 3 av')
  await expect(studentNav(student)).toContainText('2 av')
  await expect(noraRow(teacher)).toContainText('Pågår · 2 av')
  expect(errors).toEqual([])
})

test('en glemt økt fra tidligere (Multiplikasjon økt 1, startet for 5 timer siden) gir Nora venteskjermen, ikke oppgaver', async ({ context }) => {
  const startedAt = Date.now() - 5 * 60 * 60 * 1000
  const forgotten = { sessionId: 'multiplikasjon-1', status: 'running', startedAt, runId: `multiplikasjon-1-${startedAt}` }
  await context.addInitScript((value) => localStorage.setItem('laerestien:lokal-okt:okt:4A', value), JSON.stringify(forgotten))
  const student = await context.newPage()
  const errors = await open(student, 'elev')
  await expect(student.getByTestId('tavle-waiting')).toBeVisible()
  await expect(student.getByLabel('Ditt svar')).toHaveCount(0)
  await expect(student.getByRole('banner')).not.toContainText('økt 1')

  // Læreren starter økta si: Nora får den, uten å laste siden på nytt.
  const teacher = await context.newPage()
  errors.push(...(await open(teacher, 'laerer')))
  await expect(teacher.getByTestId('okt-status')).toHaveText('Planlagt – ikke startet')
  await teacher.getByRole('button', { name: 'Start økt' }).click()
  await expect(studentNav(student)).toContainText('Oppgave 1 av')
  await expect(student.getByRole('banner')).toContainText(await sessionName(teacher))
  expect(errors).toEqual([])
})
