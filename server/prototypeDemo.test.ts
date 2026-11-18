// Tester for endringene før demoen i uke 47: like mange standardoppgaver per nivå, oppgaveforslag og temaoversikt som
// aldri står tomme, kompetansemål-feltet som er fjernet fra «Lag oppgaver med AI», og sidemenyen. Kjør: npm test
// (Nora som «Nora L.» testes i liveSession.test.ts. Sidemenyen i nettleseren testes også i e2e/sidebar.spec.ts.)

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import type { TaskRequest } from '../src/ai/contract.ts'
import { buildLevelContexts } from '../src/ai/referenceTasks.ts'
import { furthestReachable } from '../src/features/live/liveProgress.ts'
import { initialTasks } from '../src/features/sessions/mockData.ts'
import { buildTasks, evenLevels, mergeTasks, planned, TASKS_PER_LEVEL, trimStoredTasks } from '../src/features/sessions/sessionTasks.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'
import { classMastery, classTopics, statsFor, topicInsights } from '../src/features/statistics/mockData.ts'
import { DEMO_TODAY, semesterOverview } from '../src/features/statistics/semesterOverview.ts'
import { hasEnoughData, suggestionPlan } from '../src/features/statistics/simulatedSuggestions.ts'
import { roster } from '../src/features/class/roster.ts'
import { unitSpecs } from '../src/features/topics/yearPlan.ts'
import type { LevelGroup, Session, SessionTask, StudentStats, Task } from '../src/types/index.ts'
import type { GenerateResult } from './gemini.ts'
import { createTaskHandler } from './taskHandler.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const counts = (tasks: SessionTask[]) => [1, 2, 3].map((l) => tasks.filter((t) => t.level === l).length)

/** Standardoppgavene i alle øktene, satt sammen som i SessionsProvider: arbeidsark først, så grunnoppgavene. */
function allStandardSessions() {
  const keys = ['tall:start', 'tall:slutt', ...unitSpecs.map((u) => u.unitId).filter((id) => id !== 'tall')]
  const base: Record<string, SessionTask[]> = { ...initialTasks }
  for (const plan of keys.flatMap(planned)) base[plan.id] = buildTasks(plan)
  const full: Record<string, SessionTask[]> = {}
  for (const [id, list] of Object.entries(base)) full[id] = mergeTasks(worksheetTasks[id] ?? [], list)
  return full
}

describe('2. like mange standardoppgaver på hvert nivå', () => {
  const full = allStandardSessions()

  it('årsaken: arbeidsarkene ble lagt oppå de fem grunnoppgavene per nivå (f.eks. Multiplikasjon økt 2 og 8)', () => {
    assert.deepEqual(counts(full['multiplikasjon-8']), [5, 5, 11])
    assert.deepEqual(counts(full['multiplikasjon-2']), [9, 17, 5])
  })

  it('hver standardøkt har like mange oppgaver på hvert nivå – fem', () => {
    assert.ok(Object.keys(full).length > 60)
    for (const [id, list] of Object.entries(full)) {
      assert.deepEqual(counts(evenLevels(list)), [TASKS_PER_LEVEL, TASKS_PER_LEVEL, TASKS_PER_LEVEL], id)
    }
  })

  it('SessionsProvider bruker utjevningen for standardøktene og for eldre lagrede sett', () => {
    const provider = read('src/features/sessions/SessionsProvider.tsx')
    assert.match(provider, /evenLevels\(list\)/)
    assert.match(provider, /trimStoredTasks\(/)
  })

  it('nedkortingen beholder både arkoppgaver og grunnoppgaver, og regnestykkene går fra lett til vanskelig', () => {
    const kept = evenLevels(full['multiplikasjon-8']).filter((t) => t.level === 3)
    assert.ok(kept.some((t) => t.source === 'worksheet') && kept.some((t) => t.source === 'generated'))
    const sizes = kept.map((t) => (t.kind === 'text' ? 0 : t.a * t.b))
    assert.deepEqual(sizes, [...sizes].sort((a, b) => a - b))
    // Ingen nye oppgaver: alt som beholdes, fantes fra før, uendret.
    for (const [id, list] of Object.entries(full)) for (const task of evenLevels(list)) assert.ok(list.includes(task), id)
  })

  it('nivåer med fem eller færre oppgaver endres ikke', () => {
    const list = full['tall-1']
    assert.deepEqual(evenLevels(list), list)
  })
})

describe('2. lærerredigerte oppgaver endres ikke av nedkortingen', () => {
  const full = allStandardSessions()['multiplikasjon-8']
  const kept = evenLevels(full)
  const dropped = full.filter((t) => !kept.includes(t))

  it('uendrede standardoppgaver som er tatt ut, fjernes fra et lagret sett', () => {
    const trimmed = trimStoredTasks(full, full, kept)
    assert.deepEqual(counts(trimmed), [5, 5, 5])
  })

  it('oppgaver læreren har endret eller laget, og AI-oppgaver, blir stående', () => {
    const [a, b, c] = dropped.filter((t): t is Task => t.kind !== 'text')
    assert.ok(a && b && c)
    const edited: SessionTask = { ...a, b: a.b + 1, source: 'teacher' }
    const sameButTeacher: SessionTask = { ...b, source: 'teacher' }
    const ai: SessionTask = { ...c, aiGenerated: true }
    const own: SessionTask = { id: 'laerer-1', level: 3, type: 'Hoderegning', instruction: 'Regn ut.', a: 12, operator: '*', b: 4, source: 'teacher' }
    const stored = full.map((t) => (t.id === a.id ? edited : t.id === b.id ? sameButTeacher : t.id === c.id ? ai : t)).concat(own)
    const trimmed = trimStoredTasks(stored, full, kept)
    for (const task of [edited, sameButTeacher, ai, own]) assert.ok(trimmed.includes(task), task.id)
    // Lærerens oppgaver er urørt (samme objekt, samme innhold).
    assert.deepEqual(trimmed.find((t) => t.id === a.id), edited)
  })

  it('et lagret sett der læreren allerede har slettet oppgaver, får ikke færre enn fem per nivå', () => {
    // Nivå 3: læreren har slettet én av de fem som beholdes, og en uendret oppgave som er tatt ut, står igjen → fem i alt.
    const keptL3 = kept.filter((t) => t.level === 3)
    const droppedL3 = dropped.find((t) => t.level === 3)!
    const stored = [...full.filter((t) => t.level !== 3), ...keptL3.slice(1), droppedL3]
    const trimmed = trimStoredTasks(stored, full, kept)
    assert.equal(counts(trimmed)[2], 5)
    assert.ok(trimmed.includes(droppedL3))
    // Uten noe å ta ut endres settet ikke.
    const own = [{ ...kept[0], id: 'laerer-x', source: 'teacher' as const }]
    assert.equal(trimStoredTasks(own, full, full), own)
  })
})

describe('3. oppgaveforslag: aldri en tom boks, og simulerte data påvirker ikke statistikken', () => {
  const noData: StudentStats = { ...statsFor(roster[0] as never, 0), support: [], mastery: [] }

  it('forslagsdialogen har ikke lenger merkelappen «AI-forslag · ikke lagt til» eller teksten om at oppgavene ikke er lagt til', () => {
    const dialog = read('src/features/statistics/SuggestedTasksDialog.tsx')
    assert.ok(!dialog.includes('AiBadge'))
    assert.ok(!dialog.includes('Oppgavene er ikke lagt til ennå'))
  })

  it('knappen heter «Lag oppgaveforslag med AI»', () => {
    const page = read('src/features/statistics/StudentStatsPage.tsx')
    assert.ok(page.includes('Lag oppgaveforslag med AI'))
    assert.ok(!page.includes('Lag forslag med AI'))
  })

  it('uten nok data: simulerte forslag med temaer, foreslått nivå og konkrete oppgaver', () => {
    assert.equal(hasEnoughData(noData), false)
    for (const stats of [null, undefined, noData]) {
      const plan = suggestionPlan({ id: 'nora', level: 3 }, stats)
      assert.equal(plan.simulated, true)
      assert.ok(plan.focus.includes('Multiplikasjon'))
      assert.equal(plan.level, 3)
      assert.equal(plan.tasks.length, 4)
      for (const task of plan.tasks) assert.ok(task.text.trim() && task.solution.trim() && task.level === 3)
    }
  })

  it('med nok data: temaene eleven trenger støtte i, fra elevens egne resultater', () => {
    const emma = roster.find((s) => s.id === 'emma')!
    const stats = statsFor(emma as never, 0)
    assert.equal(hasEnoughData(stats), true)
    const plan = suggestionPlan(emma, stats)
    assert.equal(plan.simulated, false)
    assert.deepEqual(plan.focus, stats.support.slice(0, 2))
    assert.ok(plan.tasks.length > 0)
  })

  it('dialogen viser eksemplene når data mangler eller AI-en ikke svarer, og lagrer ingenting', () => {
    const dialog = read('src/features/statistics/SuggestedTasksDialog.tsx')
    assert.match(dialog, /if \(plan\.simulated\)/)
    assert.match(dialog, /showExamples\(/)
    const module = read('src/features/statistics/simulatedSuggestions.ts')
    for (const forbidden of ['saveAnswer', 'localStorage', 'firebase', 'setDoc']) assert.ok(!module.includes(forbidden), forbidden)
  })

  it('simulerte forslag endrer ikke elevens statistikk eller klassens statistikk', () => {
    const emma = roster.find((s) => s.id === 'emma')!
    const stats = statsFor(emma as never, 0)
    const before = JSON.stringify({ stats, classMastery, topicInsights })
    suggestionPlan(emma, stats)
    suggestionPlan(emma, null)
    assert.equal(JSON.stringify({ stats, classMastery, topicInsights }), before)
  })
})

describe('4. Temaoversikt: de samme temaene som før, med simulert innhold for uke 47', () => {
  const session = (id: string, topicId: string, title: string, week: number, day: Session['slots'][number]['day'], n: number, year = 2026) =>
    ({ id, topicId, title, heading: `Økt ${n} i ${title}`, year, week, slots: [{ day, time: '08.30' }], numbers: [n] }) as unknown as Session
  const sessions = [
    session('tall-1', 'tall', 'Tall og plassverdi', 41, 'Mandag', 1),
    session('okt-3', 'tall', 'Tall og plassverdi', 44, 'Onsdag', 9),
    session('multiplikasjon-1', 'multiplikasjon', 'Multiplikasjon', 46, 'Mandag', 1),
    session('multiplikasjon-5', 'multiplikasjon', 'Multiplikasjon', 47, 'Mandag', 5),
    session('multiplikasjon-7', 'multiplikasjon', 'Multiplikasjon', 47, 'Onsdag', 7),
    session('divisjon-1', 'divisjon', 'Divisjon', 48, 'Onsdag', 1),
    session('repetisjon-host-1', 'repetisjon-host', 'Repetisjon', 50, 'Onsdag', 1),
    session('repetisjon-host-5', 'repetisjon-host', 'Repetisjon', 51, 'Onsdag', 5),
    session('geometri-1', 'geometri', 'Geometri', 1, 'Mandag', 1, 2027),
  ]
  const overview = semesterOverview(sessions)

  it('temaene er de opprinnelige (classTopics), i samme rekkefølge – ingen nye temaer', () => {
    assert.deepEqual(classTopics, ['Tallforståelse', 'Regning', 'Geometri', 'Måling', 'Problemløsning', 'Mønstre'])
    assert.deepEqual(overview.map((t) => t.row.topic), classTopics)
    assert.deepEqual(classMastery.map((r) => r.topic), classTopics)
  })

  it('innholdet følger semesteret: gjennomført, pågår nå (multiplikasjon i Regning) og kommer', () => {
    assert.deepEqual(DEMO_TODAY, { year: 2026, week: 47, day: 'Onsdag' })
    const by = (topic: string) => overview.find((t) => t.topic === topic)!
    assert.equal(by('Tallforståelse').phase, 'done')
    assert.deepEqual(by('Tallforståelse').sessions.map((s) => s.phase), ['done', 'upcoming'])
    const regning = by('Regning')
    assert.equal(regning.phase, 'current')
    assert.equal(regning.row.label, 'Pågår nå')
    assert.match(regning.row.note ?? '', /nå: Økt 7 i Multiplikasjon/)
    assert.deepEqual(regning.sessions.map((s) => s.phase), ['done', 'done', 'done', 'current', 'upcoming'])
    assert.equal(by('Problemløsning').row.label, 'Kommer')
    assert.match(by('Problemløsning').row.note ?? '', /Starter uke 51/)
    assert.match(by('Geometri').row.note ?? '', /Starter uke 1 \(våren\)/)
    assert.match(by('Måling').row.note ?? '', /Ikke i årsplanen/)
  })

  it('ingen rad står tom, og oppgavedata går foran det simulerte', () => {
    for (const t of overview) assert.ok(t.row.label && t.row.note, t.topic)
    const regning = overview.find((t) => t.topic === 'Regning')!
    const real = classMastery.find((r) => r.topic === 'Regning')!
    assert.deepEqual([regning.row.status, regning.row.filled], [real.status, real.filled])
    assert.equal(regning.insight, topicInsights.find((t) => t.topic === 'Regning'))
    assert.ok(overview.find((t) => t.topic === 'Tallforståelse')!.insight!.tasks.length > 0)
  })

  it('siden bruker oversikten, og den simulerte mestringen endrer ikke den øvrige statistikken', () => {
    assert.match(read('src/features/statistics/ClassStatsPage.tsx'), /semesterOverview\(sessions\)/)
    const before = JSON.stringify({ classMastery, topicInsights })
    semesterOverview(sessions)
    assert.equal(JSON.stringify({ classMastery, topicInsights }), before)
  })
})

describe('elevens navigering: ingen hopp forbi en oppgave som ikke er fullført', () => {
  it('lengst fram er første oppgave som ikke er levert, eller avslutningen når alt er levert', () => {
    assert.equal(furthestReachable([false, false, false]), 0)
    assert.equal(furthestReachable([true, false, false]), 1)
    assert.equal(furthestReachable([true, true, true]), 3)
    // En oppgave levert lenger fram (f.eks. fra før) åpner ikke for å hoppe over en som ikke er fullført.
    assert.equal(furthestReachable([true, false, true]), 1)
  })

  it('«Forrige oppgave» står i oppgavekortet (bare når det går an å gå tilbake), og det er ingen «Neste oppgave» over kortet', () => {
    const page = read('src/features/student/StudentHomePage.tsx')
    const nav = page.slice(page.indexOf('<nav aria-label="Bla mellom oppgavene"'), page.indexOf('</nav>'))
    assert.ok(!nav.includes('Neste oppgave'))
    // Over kortet bare etter siste oppgave, der det ikke er noe kort.
    assert.match(nav, /\{index > 0 && index >= tasks\.length && \(/)
    assert.match(page, /onPrevious=\{index > 0 \? \(\) => goTo\(index - 1\) : undefined\}/)
    for (const screen of ['TaskScreen', 'TextTaskScreen']) {
      assert.match(read(`src/features/student/${screen}.tsx`), /\{onPrevious && <PreviousTaskButton onClick=\{onPrevious\} \/>\}/, screen)
    }
    assert.match(page, /Math\.min\(run\.index, furthest\)/)
    assert.match(page, /Math\.min\(next, furthest\)/)
  })
})

describe('5. kompetansemål-feltet er fjernet fra «Lag oppgaver med AI»', () => {
  const source = read('src/features/tasks/AiTaskGenerator.tsx')

  it('ingen tekstboks og ingen tilstand for kompetansemål – bestillingen sender tomt, som et tomt felt før', () => {
    assert.ok(!source.includes('Kompetansemål'))
    assert.ok(!source.includes('<textarea'))
    assert.ok(!source.includes('setOfficialGoals'))
    assert.match(source, /officialGoals: '',/)
  })

  it('genereringen fungerer uten feltet: bestillingen gir oppgaver på de valgte nivåene', async () => {
    const levels: LevelGroup[] = ([1, 2, 3] as const).map((level) => ({ level, title: `Nivå ${level}`, subtitle: '', description: '', taskCount: 0, studentCount: 0 }))
    const raw = (nivaa: number, a: number, b: number) => ({ nivaa, format: 'regnestykke', oppgavetype: 'Hoderegning', instruksjon: 'Regn ut.', tall1: a, regneart: '·', tall2: b, oppgavetekst: '', fasit: '', kompetansemaal: '', tilpasning: 'Nivå.' })
    const generate = async (): Promise<GenerateResult> => {
      const body = JSON.stringify({ melding: '', oppgaver: [raw(1, 2, 3), raw(2, 4, 6), raw(3, 7, 8)] })
      return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
    }
    const handler = createTaskHandler({ generate: generate as never, log: () => {}, newRequestId: () => 'req-uten-km', newSeed: () => 1 })
    const request: Extract<TaskRequest, { kind: 'general' }> = {
      kind: 'general',
      lesson: { subject: 'Matematikk', grade: '4. trinn', topic: 'Multiplikasjon', sessionHeading: 'Egen økt', sessionDescription: '', sessionGoals: [] },
      perLevel: 1,
      officialGoals: '',
      wishes: '',
      levels: buildLevelContexts(levels, []),
    }
    const result = await handler(request, { uid: 'l', classId: '4A' })
    assert.deepEqual(result.tasks.map((t) => t.level), [1, 2, 3])
    assert.ok(result.tasks.every((t) => t.competenceGoal === ''))
  })
})

describe('6. sidemenyen: alltid åpen på vanlige skjermer, ikonstripe på smale', () => {
  const sidebar = read('src/components/layout/Sidebar.tsx')
  const layout = read('src/components/layout/AppLayout.tsx')

  it('ingen knapp for å skjule eller vise menyen', () => {
    for (const source of [sidebar, layout]) {
      for (const removed of ['PanelLeftClose', 'PanelLeftOpen', 'Skjul meny', 'Vis meny', 'Åpne meny', 'toggleCollapsed']) {
        assert.ok(!source.includes(removed), removed)
      }
    }
  })

  it('fra 1024 px vises hele menyen, under 1024 px en stripe med ikoner som har navn', () => {
    assert.match(sidebar, /hidden w-60 flex-col[^"]*lg:flex/)
    assert.match(sidebar, /w-16[^"]*lg:hidden/)
    assert.match(sidebar, /aria-label=\{label\}/)
    assert.match(sidebar, /title=\{label\}/)
  })
})
