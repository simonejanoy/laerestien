// Tester for oppgaveprofilene i årsplanen: grunnoppgavene og AI-bestillingen skal følge den
// konkrete økta. Rene funksjoner – ingen Gemini-kall. Kjør: npm test

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseTaskResult, readLevelContexts, readSessionProfile, type AiTaskDraft, type TaskRequest } from '../src/ai/contract.ts'
import { toSessionTask, toTextTask } from '../src/ai/drafts.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { buildTasks, levelsFor, mergeTasks, planned, sessionTaskKey, type Planned } from '../src/features/sessions/sessionTasks.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'
import { unitSpecs } from '../src/features/topics/yearPlan.ts'
import type { Level, SessionTask, Task } from '../src/types/index.ts'
import { taskPrompt } from './prompts.ts'
import { checkGeneralResult } from './taskChecks.ts'

/** Oppgavene i økta slik appen bygger dem: arbeidsark først, så generert. */
const tasksOf = (plan: Planned) => mergeTasks(worksheetTasks[plan.id] ?? [], buildTasks(plan))

const allPlans = unitSpecs.flatMap((u) => planned(u.unitId)).concat(planned('tall:slutt'))
const plan = (id: string) => {
  const found = allPlans.find((p) => p.id === id)
  assert.ok(found, `fant ikke ${id}`)
  return found
}

const isMath = (t: SessionTask): t is Task => t.kind !== 'text'
const textOf = (t: SessionTask) => (t.kind === 'text' ? t.text : t.instruction)
const timesTasks = (tasks: SessionTask[]) => tasks.filter(isMath).filter((t) => t.operator === '*')
const usesFactor = (t: Task, factors: number[]) => factors.includes(t.a) || factors.includes(t.b)

/** Økta uten fagområde – slik andre tema enn multiplikasjon sender referanser (dagens løsning). */
const withoutArea = (p: Planned): Planned => ({ ...p, profile: p.profile && { ...p.profile, area: undefined } })

/** Bestillingen AI-en får for en generell oppgavegenerering i økta. */
function requestFor(p: Planned, tasks = tasksOf(p), wishes = ''): Extract<TaskRequest, { kind: 'general' }> {
  const request: TaskRequest = {
    kind: 'general',
    lesson: {
      subject: 'Matematikk',
      grade: '4. trinn',
      topic: p.spec.topic,
      sessionHeading: p.heading,
      sessionDescription: p.spec.description,
      sessionGoals: p.spec.goals,
    },
    perLevel: 2,
    officialGoals: '',
    wishes,
    // Slik serveren leser det appen sender.
    levels: readLevelContexts(buildLevelContexts(levelsFor(p, 5, 6), tasks, p.profile)),
    ...(p.profile && { profile: readSessionProfile(toAiProfile(p.profile)) }),
  }
  return request
}

describe('multiplikasjon følger overskriften i hver økt', () => {
  it('1. multiplikasjon-1 (like grupper) har ingen gangestykker fra gangetabellen', () => {
    const tasks = tasksOf(plan('multiplikasjon-1'))
    assert.equal(tasks.filter(isMath).length, 0)
    // Gjentatt addisjon som skal skrives som gange, eller figurer med like grupper.
    for (const task of tasks) assert.match(textOf(task), /Skriv som gangestykke|Se på figuren/)
    for (const task of tasks.filter((t) => t.kind === 'text' && !t.figure)) {
      const parts = textOf(task).split('\n')[1].replace(' = ___', '').split(' + ')
      assert.ok(parts.every((x) => x === parts[0]), `ikke like grupper: ${textOf(task)}`)
    }
  })

  it('2. 0- og 1-gangen bruker bare faktorene 0 og 1', () => {
    const tasks = tasksOf(plan('multiplikasjon-2'))
    assert.ok(timesTasks(tasks).length >= 15)
    assert.equal(tasks.filter((t) => !isMath(t) || t.operator !== '*').length, 0)
    for (const task of timesTasks(tasks)) assert.ok(usesFactor(task, [0, 1]), `${task.a} · ${task.b}`)
  })

  it('3. 2-, 5- og 10-gangen bruker bare disse tabellene', () => {
    const tasks = tasksOf(plan('multiplikasjon-3'))
    assert.equal(tasks.filter((t) => !isMath(t) || t.operator !== '*').length, 0)
    for (const task of timesTasks(tasks)) assert.ok(usesFactor(task, [2, 5, 10]), `${task.a} · ${task.b}`)
  })

  it('alle gangeøkter med profil holder seg til gangetabellene på hvert nivå', () => {
    for (const p of allPlans.filter((x) => x.profile?.factors && x.profile.operations.join() === '*')) {
      for (const task of timesTasks(tasksOf(p))) {
        const factors = p.profile?.levels[task.level].factors ?? []
        assert.ok(usesFactor(task, factors), `${p.id} nivå ${task.level}: ${task.a} · ${task.b} (tillatt ${factors})`)
      }
    }
  })

  it('«Multiplisere med tiere og hundrere» har ikke drill i 5- og 10-gangen fra arbeidsarkene', () => {
    const tasks = tasksOf(plan('multiplikasjon-7'))
    assert.ok(tasks.every((t) => t.source === 'generated'))
    for (const task of timesTasks(tasks)) assert.ok(task.b % 10 === 0 && task.b >= 10)
  })

  it('4. ingen identiske oppgaver på samme nivå i samme økt', () => {
    for (const p of allPlans) {
      const all = [...(worksheetTasks[p.id] ?? []), ...buildTasks(p)]
      const merged = tasksOf(p)
      assert.equal(new Set(merged.map(sessionTaskKey)).size, merged.length, p.id)
      // Generatoren lager selv fem ulike per nivå.
      for (const level of [1, 2, 3] as Level[]) {
        const generated = buildTasks(p).filter((t) => t.level === level)
        assert.equal(new Set(generated.map(sessionTaskKey)).size, generated.length, `${p.id} nivå ${level}`)
      }
      assert.ok(merged.length <= all.length)
    }
  })

  it('øktens nivåbeskrivelser erstatter temaets generelle', () => {
    const levels = levelsFor(plan('multiplikasjon-2'), 5, 6)
    assert.ok(levels.every((l) => !/2, 5 og 10|3, 4, 6, 7 og 8/.test(`${l.title} ${l.subtitle} ${l.description}`)))
    assert.match(levels[0].subtitle, /0 og 1/)
  })
})

describe('måling følger enhetene i hver økt', () => {
  it('5. maling-1 (liter og desiliter) har ingen kubeoppgaver som bare er gangestykker, og ingen milliliter eller desimaltall', () => {
    const tasks = tasksOf(plan('maling-1'))
    assert.match(plan('maling-1').heading, /liter og desiliter/)
    for (const task of tasks) {
      assert.ok(!/kube/i.test(textOf(task)), textOf(task))
      assert.match(textOf(task), /liter|dl|desiliter/, `ikke volum: ${textOf(task)}`)
      assert.ok(!/\bml\b|milliliter|\d,\d/.test(textOf(task)), textOf(task))
    }
  })

  it('regresjon: «Hvert lag i en boks har 4 kuber …» finnes ikke i økta om liter og desiliter', () => {
    const tasks = tasksOf(plan('maling-1'))
    assert.ok(!tasks.some((t) => textOf(t).includes('Hvert lag i en boks har 4 kuber. Hvor mange kuber er det i 4 lag?')))
    assert.ok(!tasks.some((t) => textOf(t).startsWith('Hvert lag i en boks')))
  })

  it('maling-2 (kilogram og gram) bruker bare kg og g', () => {
    for (const task of tasksOf(plan('maling-2'))) {
      assert.ok(!/tonn|\bmg\b|liter|\bdl\b|\bcm\b/.test(textOf(task)), textOf(task))
      assert.match(textOf(task), /kg|kilo|gram|\bg\b/)
    }
  })

  it('6. lengde er ikke med i Måling: maling-3 handler om desimaltall i liter og kilogram', () => {
    // Lengde med desimaltall hører til Tall og regning. Lengdearkene er tatt ut, og ingen økt i Måling har lengdeoppgaver.
    const lengthIds = /-millimeter-|-sammenlign-lengde-|-hvem-eier-bilene-/
    assert.deepEqual(Object.entries(worksheetTasks).filter(([, tasks]) => tasks.some((t) => lengthIds.test(t.id))).map(([id]) => id), [])
    assert.match(plan('maling-3').heading, /Desimaltall i måling/)
    const tasks = tasksOf(plan('maling-3'))
    const withSolution = (t: SessionTask) => `${textOf(t)} ${t.kind === 'text' ? t.solution : ''}`
    assert.ok(tasks.every((t) => /\d,\d/.test(withSolution(t)) && /liter|kg/.test(withSolution(t))), 'desimaltall i liter eller kilogram')
    assert.ok(!tasks.some((t) => /\b(mm|cm|dm|m)\b|millimeter|centimeter|meter/.test(textOf(t))), 'ingen lengder')
    // Arealøkta har ikke lenger sammenligninger mellom cm² og m² (20000 cm², 7,5 m²).
    assert.ok(!tasksOf(plan('maling-4')).some((t) => textOf(t).includes('m²') && !textOf(t).includes('cm²')))
  })
})

describe('referanser til AI-en', () => {
  it('multiplikasjonsøkter sender ingen elevoppgaver som referanser – bare en oppsummering av oppgavesettet', () => {
    for (const p of allPlans.filter((x) => x.spec.unitId === 'multiplikasjon')) {
      const contexts = buildLevelContexts(levelsFor(p, 5, 6), tasksOf(p), p.profile)
      assert.ok(p.profile?.area, `${p.id} mangler fagområde`)
      for (const level of contexts) {
        assert.deepEqual(level.referenceTasks, [], p.id)
        assert.equal(level.existing?.length, tasksOf(p).filter((t) => t.level === level.level).length, p.id)
      }
    }
  })

  it('7. ikke-gjennomgåtte AI-oppgaver brukes aldri som referanse', () => {
    const p = withoutArea(plan('multiplikasjon-3'))
    const aiTask = (level: Level): SessionTask => ({ ...(toSessionTask(draftMath(level, 6, '*', 7), `ai-${level}`) as Task) })
    const contexts = buildLevelContexts(levelsFor(p, 5, 6), [aiTask(1), aiTask(2), aiTask(3), ...tasksOf(p)], p.profile)
    assert.ok(!JSON.stringify(contexts).includes('6 · 7'))
  })

  it('8. oppgaver med figur sendes ikke som referanse', () => {
    for (const id of ['multiplikasjon-1', 'maling-4', 'maling-6']) {
      const p = plan(id)
      const refs = buildLevelContexts(levelsFor(p, 5, 6), tasksOf(p), p.profile).flatMap((l) => l.referenceTasks)
      // Økta har figuroppgaver, men ingen av dem sendes – heller ikke som tekst uten figuren.
      assert.ok(tasksOf(p).some((t) => t.kind === 'text' && t.figure), id)
      for (const ref of refs) assert.ok(!/figur|klokka viser/i.test(ref.studentText), `${id}: ${ref.studentText}`)
      const figureTexts = tasksOf(p).flatMap((t) => (t.kind === 'text' && t.figure ? [t.text] : []))
      assert.ok(!refs.some((r) => figureTexts.includes(r.studentText)), id)
    }
  })

  it('korte regnesett gir bare regnestykker som referanser, ikke en sjelden tekstoppgave', () => {
    const p = withoutArea(plan('multiplikasjon-4'))
    const contexts = buildLevelContexts(levelsFor(p, 5, 6), tasksOf(p), p.profile)
    // Nivå 3 har én lang regnesirkel blant mange gangestykker.
    assert.ok(tasksOf(p).some((t) => t.level === 3 && t.kind === 'text'))
    for (const level of contexts) {
      assert.equal(level.referenceTasks.length, 3)
      assert.ok(level.referenceTasks.every((r) => r.taskType === 'Hoderegning'), JSON.stringify(level.referenceTasks))
    }
  })

  it('arbeidsark og lærerens egne oppgaver går foran genererte', () => {
    const p = withoutArea(plan('multiplikasjon-3'))
    const teacher: Task = { id: 'x', level: 2, type: 'Hoderegning', instruction: 'Regn ut.', a: 7, operator: '*', b: 5, source: 'teacher' }
    const contexts = buildLevelContexts(levelsFor(p, 5, 6), [...tasksOf(p), teacher], p.profile)
    assert.ok(contexts[1].referenceTasks.some((r) => r.studentText.includes('7 · 5')))
    // Uten lærerens egne: arbeidsarket (instruksjonen «Regn ut.») går foran de genererte.
    const sheetOnly = buildLevelContexts(levelsFor(p, 5, 6), tasksOf(p), p.profile)
    assert.ok(sheetOnly[0].referenceTasks.every((r) => r.studentText.startsWith('Regn ut. ')))
  })
})

const base = { competenceGoal: '', adaptation: '' }
const draftMath = (level: Level, a: number, operator: '+' | '-' | '*' | '/', b: number): AiTaskDraft => ({
  ...base,
  format: 'math',
  level,
  taskType: 'Hoderegning',
  instruction: 'Regn ut.',
  a,
  operator,
  b,
})

describe('AI-format: regnestykke eller tekst', () => {
  it('9. AI-generert hoderegning blir en vanlig regneoppgave, merket som AI og ikke gjennomgått', () => {
    const parsed = parseTaskResult({
      melding: '',
      oppgaver: [
        { nivaa: 1, format: 'regnestykke', oppgavetype: 'Hoderegning', instruksjon: 'Regn ut.', tall1: 7, regneart: '·', tall2: 5, oppgavetekst: '', fasit: '', kompetansemaal: '', tilpasning: '' },
        // Ugyldige regnestykker tas bort: deling som ikke går opp og negativt svar.
        { nivaa: 1, format: 'regnestykke', instruksjon: 'Regn ut.', tall1: 7, regneart: ':', tall2: 2, oppgavetekst: '', fasit: '', kompetansemaal: '', tilpasning: '' },
        { nivaa: 1, format: 'regnestykke', instruksjon: 'Regn ut.', tall1: 3, regneart: '-', tall2: 5, oppgavetekst: '', fasit: '', kompetansemaal: '', tilpasning: '' },
      ],
    })
    assert.equal(parsed?.tasks.length, 1)
    const task = toSessionTask(parsed!.tasks[0], 'ny-1')
    assert.notEqual(task.kind, 'text')
    assert.deepEqual(task, {
      id: 'ny-1',
      level: 1,
      type: 'Hoderegning',
      instruction: 'Regn ut.',
      a: 7,
      operator: '*',
      b: 5,
      aiGenerated: true,
      reviewed: false,
    })
  })

  it('10. AI-genererte tekstoppgaver fungerer fortsatt', () => {
    const parsed = parseTaskResult({
      melding: '',
      oppgaver: [{ nivaa: 2, format: 'tekst', oppgavetekst: 'Lise har 4 poser med 6 boller. Hvor mange boller?', fasit: '24', kompetansemaal: '', tilpasning: 'Kort' }],
    })
    const task = toSessionTask(parsed!.tasks[0], 'ny-2')
    assert.equal(task.kind, 'text')
    assert.equal(task.kind === 'text' && task.text, 'Lise har 4 poser med 6 boller. Hvor mange boller?')
    assert.equal(task.aiGenerated, true)
    assert.equal(task.reviewed, false)
    // Gamle svar uten format er tekstoppgaver.
    assert.equal(parseTaskResult({ melding: '', oppgaver: [{ nivaa: 1, oppgavetekst: 'A', fasit: 'B' }] })?.tasks[0].format, undefined)
    // Elevforslag og justering viser regnestykker som tekst.
    assert.equal(toTextTask(draftMath(1, 6, '*', 4), 'x').text, 'Regn ut.\n6 · 4 = ___')
    assert.equal(toTextTask(draftMath(1, 6, '*', 4), 'x').solution, '24')
  })

  it('11. prompten har øktens profil og ikke motstridende nivåbeskrivelser', () => {
    const prompt = taskPrompt(requestFor(plan('multiplikasjon-2')))
    assert.ok(prompt.includes('Øktprofil (gjelder foran temaets generelle beskrivelse og mål):'))
    assert.ok(prompt.includes('- Faglig fokus: Gangetegnet (·), 0-gangen og 1-gangen.'))
    assert.ok(prompt.includes('- Gangetabeller i økta: 0, 1. Ikke bruk andre gangetabeller.'))
    assert.ok(prompt.includes('Tallområde og utfordring: Tall fra 11 til 99 ganget med 0 eller 1'))
    assert.ok(prompt.includes('Vanligste oppgavetype i oppgavesettet: Hoderegning – lag format «regnestykke»'))
    assert.ok(prompt.includes('Format: Bruk «regnestykke»'))
    // Temaets generelle nivåbeskrivelser (2, 5 og 10 osv.) er ikke med.
    assert.ok(!/Gange med 2, 5 og 10|Gange med 3, 4, 6, 7 og 8/.test(prompt))
    assert.ok(prompt.includes('Beskrivelse av hele temaet (bakgrunn – øktprofilen under gjelder for timen)'))

    const measure = taskPrompt(requestFor(plan('maling-1')))
    assert.ok(measure.includes('- Måleenheter i økta: L, dL'))
    assert.ok(measure.includes('Kubeoppgaver som bare er gangestykker'))
  })

  it('elevforslag og justering ber om tekstformat', () => {
    const revise = taskPrompt({
      kind: 'revise',
      context: { subject: 'Matematikk', grade: '4. trinn', topic: 'Gange' },
      task: { level: 1, studentText: 'A', solution: 'B', competenceGoal: '', adaptation: '' },
      instruction: 'Enklere',
    })
    assert.ok(revise.includes('Format: Bruk «tekst» for alle oppgaver.'))
  })
})

describe('regresjon: korte regnesett får ikke lange AI-tekstoppgaver', () => {
  const longText: AiTaskDraft = {
    ...base,
    level: 1,
    studentText: 'Ola har 3 poser med 4 epler. a) Hvor mange epler har han? b) Han spiser 2. Hvor mange er igjen? c) Forklar hvordan du tenkte.',
    solution: 'a) 12 b) 10',
  }

  it('lange tekstoppgaver med delspørsmål tas bort når læreren ikke har bedt om dem', () => {
    const request = requestFor(plan('multiplikasjon-3'))
    const tasks = [longText, draftMath(1, 4, '*', 10), draftMath(2, 6, '*', 5), draftMath(2, 8, '*', 5), draftMath(3, 7, '*', 2), draftMath(3, 9, '*', 10)]
    const checked = checkGeneralResult({ tasks, message: '' }, request)
    assert.ok(!checked.result.tasks.includes(longText))
    assert.match(checked.warning ?? '', /nivå 1 fikk 1 av 2/)
    assert.match(checked.warning ?? '', /ikke passet formatet/)
    // Regnestykkene beholdes som regnestykker.
    assert.ok(checked.result.tasks.every((t) => t.format === 'math'))
  })

  it('beholdes når læreren uttrykkelig ber om tekstoppgaver', () => {
    const request = requestFor(plan('multiplikasjon-3'), undefined, 'Lag tekstoppgaver med flere spørsmål')
    const checked = checkGeneralResult({ tasks: [longText, draftMath(1, 4, '*', 10)], message: '' }, request)
    assert.ok(checked.result.tasks.includes(longText))
  })

  it('gangestykker utenfor øktas tabeller logges for tema uten fagområde', () => {
    const checked = checkGeneralResult({ tasks: [draftMath(1, 7, '*', 8)], message: '' }, requestFor(withoutArea(plan('multiplikasjon-3'))))
    assert.ok(checked.issues.some((i) => i.includes('utenfor øktas gangetabeller')))
    assert.equal(checked.result.tasks.length, 1)
  })

  it('gangestykker utenfor øktas tabeller avvises i multiplikasjon når læreren ikke har bedt om dem', () => {
    const checked = checkGeneralResult({ tasks: [draftMath(1, 7, '*', 8)], message: '' }, requestFor(plan('multiplikasjon-3')))
    assert.equal(checked.result.tasks.length, 0)
    assert.equal(checked.removed.outsideTables, 1)
    assert.match(checked.warning ?? '', /1 oppgave ble tatt bort: 1 som brukte gangetabeller utenfor økta/)
    const asked = checkGeneralResult({ tasks: [draftMath(1, 7, '*', 8)], message: '' }, requestFor(plan('multiplikasjon-3'), undefined, 'Ta med 7 · 8'))
    assert.equal(asked.result.tasks.length, 1)
  })
})
