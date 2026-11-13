// Tester for AI-støttet repetisjon: elevsvar lagres anonymt når en oppgave er ferdig rettet, analysen per periode,
// nivå og undertema (terskler, rangering og vårens vekt), eksempeldata bare som reserve, den anonyme oppsummeringen
// AI-en får, fordelingen på bestillinger og hele flyten mot en simulert AI. Ingen ekte Gemini- eller Firestore-kall.
// Kjør: npm test

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import { readRepetition, type AiLevel, type TaskRequest } from '../src/ai/contract.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { profileForSkills } from '../src/ai/sessionProfile.ts'
import { analyze, MIN_ANSWERS, MIN_STUDENTS, PERIODS, PLAN_FALLBACK_NOTICE, PLAN_REASON, SPRING_WEIGHT, areaReason, planOrder, rankAreas, suggestAreas, summaryLine } from '../src/features/repetition/analysis.ts'
import { answerRecord, skillOfTask, taskTypeOf, type AnswerRecord } from '../src/features/repetition/answers.ts'
import { ordersForAreas, planOrders } from '../src/features/repetition/plan.ts'
import { clearAreaSelection, loadAreaSelection, saveAreaSelection } from '../src/features/repetition/selectionStorage.ts'
import { finalResultOf, initialMathState, initialTextState } from '../src/features/student/studentTasks.ts'
import type { Level, LevelGroup, SessionTask } from '../src/types/index.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { createTaskHandler } from './taskHandler.ts'

/** `n` svar på et undertema og nivå fra `students` ulike elever, med `right` riktige. */
function answers(skill: string, topicId: string, level: Level, n: number, right: number, students = 4, taskType = 'Hoderegning'): AnswerRecord[] {
  return Array.from({ length: n }, (_, i) => ({
    studentId: `elev-${i % students}`,
    sessionId: `${topicId}-1`,
    topicId,
    skill,
    level,
    taskType,
    correct: i < right,
    attempts: i < right ? 1 : 3,
    at: 1,
  }))
}

describe('elevsvar lagres anonymt når oppgaven er ferdig rettet', () => {
  const task = (id: string): SessionTask => ({ id, level: 2, type: 'Hoderegning', instruction: 'Regn ut.', a: 7, operator: '*', b: 8 })

  it('resultatet leses ut av oppgavetilstanden: riktig og antall forsøk, eller vist svar', () => {
    assert.equal(finalResultOf(initialMathState()), null)
    assert.deepEqual(finalResultOf({ ...initialMathState(), phase: 'correct', attemptsLeft: 2 }), { correct: true, attempts: 2 })
    assert.deepEqual(finalResultOf({ ...initialMathState(), phase: 'revealed', attemptsLeft: 0 }), { correct: false, attempts: 3 })
    assert.deepEqual(finalResultOf({ ...initialTextState(), submitted: true, result: 'correct', wrongTries: 1 }), { correct: true, attempts: 2 })
    assert.deepEqual(finalResultOf({ ...initialTextState(), submitted: true, result: 'revealed', wrongTries: 2 }), { correct: false, attempts: 2 })
    // Tekstsvar læreren vurderer selv (ingen automatisk retting) gir ikke noe resultat.
    assert.equal(finalResultOf({ ...initialTextState(), submitted: true }), null)
  })

  it('undertemaet og oppgavetypen hentes fra økta og oppgaven – ingen navn eller svartekst lagres', () => {
    const session = { id: 'repetisjon-var-2', topicId: 'repetisjon-var', skillIds: ['mal.areal', 'mal.areal-omkrets', 'mal.tid'] }
    assert.equal(skillOfTask(session, task('repetisjon-var-2-n2-1')), 'mal.areal')
    assert.equal(skillOfTask(session, task('repetisjon-var-2-n2-3')), 'mal.tid')
    assert.equal(skillOfTask(session, task('repetisjon-var-2-n2-4')), 'mal.areal')
    assert.equal(skillOfTask(session, task('ai-123')), 'mal.areal')
    assert.equal(skillOfTask({ id: 'x', skillIds: [] }, task('x-n1-1')), null)
    assert.equal(taskTypeOf({ kind: 'text', id: 't', level: 1, text: 'Hva er klokka?', solution: '08:30', competenceGoal: '', adaptation: '', aiGenerated: false, reviewed: false, figure: { kind: 'clock', time: '08:30' } }), 'Klokke')

    const record = answerRecord('uid-abc', { id: 'divisjon-5', topicId: 'divisjon', skillIds: ['div.rest'] }, task('divisjon-5-n2-1'), { correct: false, attempts: 3 }, 42)!
    assert.deepEqual(Object.keys(record).sort(), ['at', 'attempts', 'correct', 'level', 'sessionId', 'skill', 'studentId', 'taskType', 'topicId'])
    assert.deepEqual([record.skill, record.level, record.correct, record.attempts, record.topicId], ['div.rest', 2, false, 3, 'divisjon'])
    // Feltene er de samme som Firestore-reglene tillater (hasOnly).
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
    assert.ok(rules.includes("hasOnly(['studentId', 'sessionId', 'topicId', 'skill', 'level', 'taskType', 'correct', 'attempts', 'at'])"))
    assert.match(rules, /match \/results\/\{classId\}\/answers\/\{answerId\}[\s\S]*allow read: if teacherOfClass\(classId\)/)
    assert.match(rules, /request\.resource\.data\.studentId == request\.auth\.uid/)
  })

  it('bare elevvisningen lagrer – forhåndsvisningen og oppgaveskjermene bruker ikke Firestore', () => {
    const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    assert.match(read('src/features/student/StudentHomePage.tsx'), /onResult=\{saveResult\}/)
    assert.match(read('src/features/student/StudentHomePage.tsx'), /saveAnswer\(classId, record\)/)
    assert.ok(!read('src/features/tasks/StudentPreviewDialog.tsx').includes('onResult'))
    for (const path of ['src/features/student/StudentTaskFlow.tsx', 'src/features/student/TaskScreen.tsx', 'src/features/student/TextTaskScreen.tsx', 'src/features/student/useTaskState.ts']) {
      assert.ok(!/firebase|firestore|saveAnswer/.test(read(path)), path)
    }
  })
})

describe('analysen per periode, nivå og undertema', () => {
  it('høstrepetisjonen bruker bare tall og plassverdi, multiplikasjon og divisjon; vinter og vår sine temaer', () => {
    assert.deepEqual(PERIODS['repetisjon-host'].sources, ['tall', 'multiplikasjon', 'divisjon'])
    assert.deepEqual(PERIODS['repetisjon-vinter'].sources, ['geometri', 'problemlosing', 'tall-og-regning'])
    assert.ok(PERIODS['repetisjon-var'].sources.length > PERIODS['repetisjon-host'].sources.length)
    const records = [...answers('div.rest', 'divisjon', 2, 20, 8), ...answers('geo.vinkler', 'geometri', 2, 20, 4)]
    const autumn = analyze(records, 'repetisjon-host')
    assert.deepEqual(autumn.levels[1].ranked.map((r) => r.skill), ['div.rest'])
    const winter = analyze(records, 'repetisjon-vinter')
    assert.deepEqual(winter.levels[1].ranked.map((r) => r.skill), ['geo.vinkler'])
  })

  it('nivåene analyseres hver for seg: besvarte, andel riktige, forsøk, elever og vanskeligste oppgavetype', () => {
    const records = [
      ...answers('div.rest', 'divisjon', 2, 20, 10, 4, 'Hoderegning'),
      ...answers('div.rest', 'divisjon', 2, 8, 2, 4, 'Tekstoppgave'),
      ...answers('div.rest', 'divisjon', 1, 12, 11),
    ]
    const result = analyze(records, 'repetisjon-host')
    const level2 = result.levels[1].ranked[0]
    assert.deepEqual([level2.answered, level2.correct, level2.students], [28, 12, 4])
    assert.equal(Math.round(level2.share * 100), 43)
    assert.deepEqual(level2.hardTypes, ['Tekstoppgave', 'Hoderegning'])
    assert.equal(result.levels[0].ranked[0].answered, 12)
    assert.equal(result.levels[2].ranked.length, 0)
  })

  it(`et undertema er en felles utfordring først med minst ${MIN_ANSWERS} svar fra minst ${MIN_STUDENTS} elever`, () => {
    const result = analyze(
      [
        ...answers('div.rest', 'divisjon', 2, MIN_ANSWERS - 1, 0),
        ...answers('div.modeller', 'divisjon', 2, 30, 0, 1),
        ...answers('div.mult-og-div', 'divisjon', 2, MIN_ANSWERS, 5, MIN_STUDENTS),
      ],
      'repetisjon-host',
    )
    assert.deepEqual(result.levels[1].ranked.map((r) => r.skill), ['div.mult-og-div'])
    assert.deepEqual(result.levels[1].insufficient.map((r) => r.skill).sort(), ['div.modeller', 'div.rest'])
  })

  it('rangeringen: lavest andel riktige først, og vårens tema veier mer i vårrepetisjonen', () => {
    const records = [...answers('div.rest', 'divisjon', 1, 20, 12), ...answers('mal.tid', 'maling', 1, 20, 13), ...answers('tall.negative', 'tall', 1, 20, 6)]
    assert.deepEqual(analyze(records, 'repetisjon-var').levels[0].ranked.map((r) => r.skill), ['tall.negative', 'mal.tid', 'div.rest'])
    const tid = analyze(records, 'repetisjon-var').levels[0].ranked.find((r) => r.skill === 'mal.tid')!
    assert.equal(tid.need, (1 - 13 / 20) * SPRING_WEIGHT)
  })
})

describe('forslaget: tre områder for økta, med forklaring', () => {
  const records = [
    ...answers('div.rest', 'divisjon', 1, 10, 6),
    ...answers('div.rest', 'divisjon', 2, 20, 6),
    ...answers('div.mult-og-div', 'divisjon', 2, 20, 14),
    ...answers('mult.tabell-6-9', 'multiplikasjon', 3, 20, 10),
    ...answers('tall.negative', 'tall', 2, 20, 16),
    ...answers('tall.hoderegning', 'tall', 2, 5, 0),
  ]

  it('alle nivåene samles per område, og de tre med høyest andel feil svar foreslås', () => {
    const { ranked, insufficient } = rankAreas(records, 'repetisjon-host')
    const rest = ranked.find((r) => r.skill === 'div.rest')!
    assert.deepEqual([rest.answered, Math.round(rest.share * 100)], [30, 40])
    assert.deepEqual(ranked.map((r) => r.skill), ['div.rest', 'mult.tabell-6-9', 'div.mult-og-div', 'tall.negative'])
    // For lite grunnlag (5 svar) foreslås ikke, selv med bare feil svar.
    assert.deepEqual(insufficient.map((r) => r.skill), ['tall.hoderegning'])
    const suggestion = suggestAreas(records, 'repetisjon-host')
    assert.deepEqual(suggestion.skills, ['div.rest', 'mult.tabell-6-9', 'div.mult-og-div'])
    assert.equal(suggestion.fromPlan, false)
  })

  it('likt behov: området flest elever har svart feil på, kommer først', () => {
    const tied = [...answers('div.rest', 'divisjon', 2, 20, 10, 2), ...answers('div.modeller', 'divisjon', 2, 20, 10, 5)]
    assert.deepEqual(rankAreas(tied, 'repetisjon-host').ranked.map((r) => r.skill), ['div.modeller', 'div.rest'])
  })

  it('forklaringen sier hvorfor – med områdets tall, uten elevnavn og uten nivå', () => {
    const suggestion = suggestAreas(records, 'repetisjon-host')
    assert.equal(suggestion.reasons['div.rest'], 'Valgt fordi elevene har svart feil på 60 % av oppgavene her (30 svar fra 4 elever).')
    for (const reason of Object.values(suggestion.reasons)) {
      assert.ok(!/[Nn]ivå|elev-\d/.test(reason), reason)
    }
    // Vår: vårens tema veier mer – og forklaringen sier det.
    const spring = rankAreas(answers('mal.tid', 'maling', 1, 20, 13), 'repetisjon-var').ranked[0]
    assert.match(areaReason(spring, 'repetisjon-var'), /Vårens temaer veier mer i vårrepetisjonen\.$/)
  })

  it('uten nok elevsvar: de tre første områdene i temaplanen, tydelig merket', () => {
    const none = suggestAreas([], 'repetisjon-var', ['sdiv.hte', 'sdiv.malings-delings'])
    assert.equal(none.fromPlan, true)
    assert.deepEqual(none.skills, planOrder('repetisjon-var', ['sdiv.hte', 'sdiv.malings-delings']).slice(0, 3))
    assert.deepEqual(none.skills.slice(0, 2), ['sdiv.hte', 'sdiv.malings-delings'])
    assert.ok(Object.values(none.reasons).every((r) => r === PLAN_REASON))
    assert.equal(PLAN_FALLBACK_NOTICE, 'Ikke nok elevsvar ennå – de tre første områdene i perioden er valgt. Velg selv hvilke som skal repeteres.')
    // Delvis nok svar: fylles opp fra temaplanen, merket per område.
    const partly = suggestAreas(answers('div.rest', 'divisjon', 2, 20, 6), 'repetisjon-host')
    assert.equal(partly.skills[0], 'div.rest')
    assert.equal(partly.skills.length, 3)
    assert.equal(partly.reasons[partly.skills[1]], PLAN_REASON)
    assert.equal(partly.fromPlan, true)
  })

  it('ingen eksempeldata lenger', () => {
    const analysis = readFileSync(new URL('../src/features/repetition/analysis.ts', import.meta.url), 'utf8')
    const planner = readFileSync(new URL('../src/features/repetition/RepetitionPlanner.tsx', import.meta.url), 'utf8')
    assert.ok(!/demoAnswers|eksempelelev|Eksempeldata/.test(analysis + planner))
  })
})

describe('lærerens valg lagres for økta', () => {
  const memory = () => {
    const data = new Map<string, string>()
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
  }
  const allowed = ['div.rest', 'div.modeller', 'mult.tabell-6-9']

  it('valget lagres per økt, leses tilbake og kan tilbakestilles til forslaget', () => {
    const storage = memory()
    assert.equal(loadAreaSelection('repetisjon-host-4', allowed, storage), null)
    assert.equal(saveAreaSelection('repetisjon-host-4', ['div.modeller', 'div.rest'], storage), true)
    assert.deepEqual(loadAreaSelection('repetisjon-host-4', allowed, storage), ['div.modeller', 'div.rest'])
    assert.equal(loadAreaSelection('repetisjon-host-5', allowed, storage), null)
    clearAreaSelection('repetisjon-host-4', storage)
    assert.equal(loadAreaSelection('repetisjon-host-4', allowed, storage), null)
  })

  it('ukjente områder og ødelagte data ignoreres, og blokkert lagring gir ingen feil', () => {
    const storage = memory()
    storage.setItem('laerestien:repetisjon-omrader:x', JSON.stringify(['div.rest', 'finnes.ikke', 7]))
    assert.deepEqual(loadAreaSelection('x', allowed, storage), ['div.rest'])
    storage.setItem('laerestien:repetisjon-omrader:x', '{ikke json')
    assert.equal(loadAreaSelection('x', allowed, storage), null)
    const blocked = { getItem: () => { throw new Error('blokkert') }, setItem: () => { throw new Error('blokkert') } }
    assert.equal(loadAreaSelection('x', allowed, blocked), null)
    assert.equal(saveAreaSelection('x', ['div.rest'], blocked), false)
    assert.equal(saveAreaSelection('x', ['div.rest'], null), false)
  })
})

describe('visningen: kort liste, knapp for hele listen og universell utforming', () => {
  const planner = readFileSync(new URL('../src/features/repetition/RepetitionPlanner.tsx', import.meta.url), 'utf8')

  it('knappen åpner hele listen, kan brukes med tastatur og har et tydelig navn og tilstand', () => {
    assert.match(planner, /<button\s+type="button"\s+aria-expanded=\{open\}\s+aria-controls="repetisjon-alle-omrader"/)
    assert.ok(planner.includes('Endre eller legg til områder'))
    assert.match(planner, /\{open && \(\s*<fieldset id="repetisjon-alle-omrader"/)
    assert.ok(planner.includes('focus-visible:outline-2'))
  })

  it('valgt / ikke valgt vises ikke bare med farge: avkrysning, ikon og teksten «Valgt»', () => {
    assert.match(planner, /type="checkbox" checked=\{checked\}/)
    assert.ok(planner.includes('<span className="sr-only">Valgt: </span>'))
    assert.match(planner, /\{checked && <span[^>]*>Valgt<\/span>\}/)
  })

  it('bare læreren ser visningen, og den viser ikke nivå eller elevnavn', () => {
    assert.ok(!/LevelBadge|profile\?\.name|studentId/.test(planner))
    const edit = readFileSync(new URL('../src/features/tasks/EditTasksPage.tsx', import.meta.url), 'utf8')
    assert.match(edit, /isPeriod\(session\.topicId\) && \(\s*<RepetitionPlanner/)
    const student = readFileSync(new URL('../src/features/student/StudentHomePage.tsx', import.meta.url), 'utf8')
    assert.ok(!student.includes('RepetitionPlanner'))
  })
})

describe('den anonyme oppsummeringen til AI-en', () => {
  it('bare undertema, tema og tall per nivå – slik spesifikasjonen beskriver', () => {
    const r = analyze(answers('div.rest', 'divisjon', 2, 28, 15, 4, 'Tekstoppgave'), 'repetisjon-host').levels[1].ranked[0]
    const line = summaryLine(r)
    assert.match(line, /^Nivå 2: Divisjon med noe til overs \(Divisjon\) – 54 % riktige av 28 besvarelser fra 4 elever, i snitt \d,\d forsøk\. Vanskeligst: Tekstoppgave\.$/)
    assert.ok(!/elev-\d/.test(line))
  })

  it('serveren slipper bare gjennom korte linjer av riktig form – ikke navn, e-post eller annet', () => {
    assert.equal(readRepetition(undefined), undefined)
    assert.equal(readRepetition({ lines: ['Nivå 2: x'], source: 'ekte' }), undefined)
    const read = readRepetition({
      source: 'real',
      lines: [
        'Nivå 2: Divisjon med noe til overs (Divisjon) – 54 % riktige av 28 besvarelser fra 4 elever.',
        'Emma sier at hun ikke forstår rest.',
        'Nivå 1: Ola har 2 av 10 riktige.',
        'Nivå 3: kontakt ola@skole.no',
        ...Array.from({ length: 12 }, (_, i) => `Nivå 1: Undertema ${i} – 50 % riktige av 12 besvarelser fra 3 elever.`),
      ],
    })!
    assert.equal(read.lines[0], 'Nivå 2: Divisjon med noe til overs (Divisjon) – 54 % riktige av 28 besvarelser fra 4 elever.')
    assert.ok(read.lines.every((l) => !/Emma|Ola|@/.test(l)))
    assert.equal(read.lines.length, 8)
  })
})

describe('fra lærerens valg til bestillinger', () => {
  const records = [
    ...answers('div.rest', 'divisjon', 2, 20, 6),
    ...answers('div.mult-og-div', 'divisjon', 2, 20, 14),
    ...answers('mult.tabell-6-9', 'multiplikasjon', 2, 20, 10),
    ...answers('tall.negative', 'tall', 2, 20, 16),
  ]
  const analysis = analyze(records, 'repetisjon-host')

  it('de valgte områdene bestilles på alle tre nivåene', () => {
    const orders = ordersForAreas(analysis, ['div.rest', 'mult.tabell-6-9'], 2)
    assert.deepEqual(orders.map((o) => [o.level, o.skills, o.count]), [
      [1, ['div.rest'], 1],
      [1, ['mult.tabell-6-9'], 1],
      [2, ['div.rest'], 1],
      [2, ['mult.tabell-6-9'], 1],
      [3, ['div.rest'], 1],
      [3, ['mult.tabell-6-9'], 1],
    ])
  })

  it('én bestilling per nivå og tema, med antallet fordelt – flest til temaet med størst behov', () => {
    const orders = planOrders(analysis, { 1: [], 2: ['div.rest', 'mult.tabell-6-9', 'div.mult-og-div'], 3: [] }, 3)
    assert.deepEqual(
      orders.map((o) => [o.level, o.skills, o.count]),
      [
        [2, ['div.rest', 'div.mult-og-div'], 2],
        [2, ['mult.tabell-6-9'], 1],
      ],
    )
    assert.equal(orders.reduce((n, o) => n + o.count, 0), 3)
    assert.ok(orders.every((o) => o.lines.every((l) => l.startsWith('Nivå 2: '))))
  })

  it('læreren kan legge til et område uten nok grunnlag – det merkes slik for AI-en', () => {
    const orders = planOrders(analysis, { 1: ['tall.hoderegning'], 2: [], 3: [] }, 2)
    assert.deepEqual(orders.map((o) => [o.level, o.skills, o.count]), [[1, ['tall.hoderegning'], 2]])
    assert.match(orders[0].lines[0], /^Nivå 1: Hoderegning \(Tall og plassverdi\) – valgt for repetisjonen \(for lite grunnlag i resultatene\)\.$/)
    assert.ok(readRepetition({ lines: orders[0].lines, source: 'real' }))
  })
})

describe('hele flyten mot en simulert AI', () => {
  const levels: LevelGroup[] = ([1, 2, 3] as const).map((level) => ({ level, title: `Nivå ${level}`, subtitle: '', description: '', taskCount: 0, studentCount: 0 }))
  const lesson = { subject: 'Matematikk', grade: '4. trinn', topic: 'Repetisjon høst', sessionHeading: 'Repetisjon: grunnleggende divisjon', sessionDescription: '', sessionGoals: [] }
  const rest = (n: number, d: number): Record<string, unknown> => ({
    nivaa: 2,
    format: 'tekst',
    oppgavetekst: `${d * 6 + n} elever skal sitte ${d} ved hvert bord. Hvor mange fulle bord blir det, og hvor mange elever blir til overs?`,
    fasit: `6 fulle bord, og ${n} elever blir til overs. ${d * 6 + n} : ${d} = 6 rest ${n}.`,
    kompetansemaal: '',
    tilpasning: 'Nivå 2.',
  })

  async function run(source: 'real' | 'demo') {
    const analysis = analyze(answers('div.rest', 'divisjon', 2, 28, 15, 4, 'Tekstoppgave'), 'repetisjon-host')
    const [order] = planOrders(analysis, { 1: [], 2: ['div.rest'], 3: [] }, 2)
    const profile = profileForSkills(order.skills, 'Repetisjon på nivå 2.')!
    let prompt = ''
    const logs: AiLogEntry[] = []
    const generate = async (_use: string, contents: { parts?: { text?: string }[] }[]): Promise<GenerateResult> => {
      prompt = contents[0]?.parts?.[0]?.text ?? ''
      const body = JSON.stringify({ melding: 'Nivå 2 har lavest andel riktige på rest, særlig i tekstoppgaver.', oppgaver: [rest(1, 4), rest(3, 5), rest(2, 7)] })
      return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
    }
    const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newRequestId: () => 'req-rep', newSeed: () => 2 })
    const request: Extract<TaskRequest, { kind: 'general' }> = {
      kind: 'general',
      lesson,
      perLevel: order.count,
      targetLevels: [order.level as AiLevel],
      officialGoals: '',
      wishes: 'De strever med å tolke resten.',
      levels: buildLevelContexts(levels, [], profile).filter((l) => l.level === order.level),
      profile: toAiProfile(profile),
      repetition: { lines: order.lines, source },
    }
    // Ingen elev-ID-er eller navn i det som sendes.
    assert.ok(!/elev-\d|studentId/.test(JSON.stringify(request)))
    const result = await handler(request, { uid: 'l', classId: '4A' })
    return { result, prompt, logs }
  }

  it('resultatene styrer innholdet, AI-en begrunner kort, og oppgavene kontrolleres som ellers', async () => {
    const { result, prompt, logs } = await run('real')
    assert.ok(prompt.includes('Repetisjon ut fra klassens resultater (samlet per nivå og undertema – ingen enkeltelever):'))
    assert.ok(prompt.includes('- Nivå 2: Divisjon med noe til overs (Divisjon) – 54 % riktige av 28 besvarelser fra 4 elever'))
    assert.ok(prompt.includes('Ikke flytt elever mellom nivåer, ikke fastsett varige nivåer, ikke diagnostiser'))
    assert.ok(prompt.includes('Fagområde: Divisjon med noe til overs'))
    assert.ok(!prompt.includes('eksempeldata'))
    assert.equal(result.tasks.length, 2)
    assert.ok(result.tasks.every((t) => t.level === 2))
    assert.equal(result.message, 'Nivå 2 har lavest andel riktige på rest, særlig i tekstoppgaver.')
    assert.equal(logs.find((e) => e.event === 'general_tasks')?.area, 'divisjon-med-rest')
  })

  it('med eksempeldata får AI-en beskjed om at tallene ikke er ekte', async () => {
    const { prompt } = await run('demo')
    assert.ok(prompt.includes('Tallene over er eksempeldata som viser hvordan repetisjonen fungerer – ikke ekte elevresultater.'))
  })

  it('regelversjonen er oppdatert for repetisjonen', () => {
    assert.equal(aiConfig.rulesVersion, '10')
  })
})
