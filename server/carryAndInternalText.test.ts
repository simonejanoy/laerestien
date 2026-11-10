// Tester for økta «Addisjon med tierovergang – øve og bruke»: alle oppgaver skal kreve addisjon med
// veksling i minst én plassverdi. Og: interne systemord (reservekandidat, utfylling, prompt …) skal
// aldri vises i synlige felt. Ingen ekte Gemini-kall. Kjør: npm test

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aiConfig } from '../src/ai/config.ts'
import type { AiLevel, AiTaskDraft, TaskRequest } from '../src/ai/contract.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { initialTasks, sessions as mockSessions } from '../src/features/sessions/mockData.ts'
import { buildTasks, levelsFor, planned } from '../src/features/sessions/sessionTasks.ts'
import type { LevelGroup, SessionTask, Task, TaskProfile } from '../src/types/index.ts'
import type { AiLogEntry, GenerateResult } from './gemini.ts'
import { taskPrompt } from './prompts.ts'
import { referenceBanks } from './references/banks.ts'
import { selectReferences, toAiReference } from './references/selectReferences.ts'
import { additionHasCarry, checkCandidates, containsInternalText, requiresCarry } from './taskChecks.ts'
import { createTaskHandler } from './taskHandler.ts'

interface S {
  id: string
  heading: string
  profile?: TaskProfile
  levels: LevelGroup[]
  tasks: SessionTask[]
}
const mock = (id: string): S => {
  const s = mockSessions.find((x) => x.id === id)!
  return { id, heading: s.heading, profile: s.taskProfile, levels: s.levels, tasks: initialTasks[id] ?? [] }
}
const fromPlan = (id: string): S => {
  const p = [...planned('tall:start'), ...planned('tall:slutt')].find((x) => x.id === id)!
  return { id, heading: p.heading, profile: p.profile, levels: levelsFor(p, 5, 6), tasks: buildTasks(p) }
}
const carrySession = mock('okt-3')

function request(s: S, wishes = '', existing: SessionTask[] = []): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: 'Tall og plassverdi', sessionHeading: s.heading, sessionDescription: '', sessionGoals: [] },
    perLevel: 2,
    officialGoals: '',
    wishes,
    levels: buildLevelContexts(s.levels, existing, s.profile).map((l) => ({
      ...l,
      referenceTasks: selectReferences(referenceBanks, { area: s.profile!.area!, secondaryAreas: s.profile!.secondaryAreas, level: l.level, seed: 1 }).map(toAiReference),
    })),
    profile: toAiProfile(s.profile!),
  }
}
const math = (level: AiLevel, a: number, b: number, operator: '+' | '-' = '+', instruction = 'Regn ut. Fyll først opp til nærmeste tier.'): AiTaskDraft => ({
  format: 'math',
  level,
  taskType: 'Hoderegning',
  instruction,
  a,
  operator,
  b,
  competenceGoal: '',
  adaptation: '',
})
const text = (level: AiLevel, studentText: string, solution: string, adaptation = ''): AiTaskDraft => ({ level, studentText, solution, competenceGoal: '', adaptation })
const accepted = (s: S, tasks: AiTaskDraft[], wishes = '') => checkCandidates(tasks, request(s, wishes))

describe('kontroll av tierovergang', () => {
  it('additionHasCarry avgjør veksling kolonne for kolonne', () => {
    assert.equal(additionHasCarry(24, 13), false)
    assert.equal(additionHasCarry(28, 7), true)
    assert.equal(additionHasCarry(48, 37), true)
    assert.equal(additionHasCarry(340, 270), true) // tierplassen: 4 + 7
    assert.equal(additionHasCarry(2600, 1500), true) // hundrerplassen: 6 + 5
    assert.equal(additionHasCarry(4508, 2391), false)
    assert.equal(additionHasCarry(19, 0), false)
  })

  it('økta om tierovergang krever det – andre økter gjør ikke', () => {
    assert.equal(carrySession.heading, 'Addisjon med tierovergang – øve og bruke')
    assert.equal(carrySession.profile?.requiresCarry, true)
    for (const id of ['okt-1-2', 'okt-4']) assert.ok(!mock(id).profile?.requiresCarry, id)
    for (const id of ['tall-1', 'tall-6', 'okt-5', 'okt-6', 'okt-7', 'okt-8']) assert.ok(!fromPlan(id).profile?.requiresCarry, id)
  })

  it('1. nivå 1: 24 + 13 avvises i økta om tierovergang', () => {
    const checked = accepted(carrySession, [math(1, 24, 13)])
    assert.equal(checked.removed.missingCarry, 1)
    assert.equal(checked.accepted.length, 0)
  })

  it('2. nivå 1: 28 + 7 godkjennes', () => {
    assert.equal(accepted(carrySession, [math(1, 28, 7)]).accepted.length, 1)
  })

  it('3. nivå 2: 48 + 37 godkjennes', () => {
    assert.equal(accepted(carrySession, [math(2, 48, 37, '+', 'Regn ut.')]).accepted.length, 1)
  })

  it('4. større addisjon med veksling i tier- eller hundrerplassen godkjennes, uten veksling avvises', () => {
    const checked = accepted(carrySession, [math(3, 2640, 1570, '+', 'Regn ut.'), math(2, 352, 186, '+', 'Regn ut.'), math(3, 4508, 2391, '+', 'Regn ut.')])
    assert.equal(checked.accepted.length, 2)
    assert.equal(checked.removed.missingCarry, 1)
    // En subtraksjon alene er ikke addisjon med tierovergang.
    assert.equal(accepted(carrySession, [math(2, 82, 47, '-', 'Regn ut.')]).removed.missingCarry, 1)
  })

  it('5. nivå 3-flertrinnsoppgaver godkjennes bare når et nødvendig addisjonstrinn har veksling', () => {
    const withCarry = text(3, 'En klasse har 368 kroner. De får 257 kroner til og bruker 90 kroner på frukt. Hvor mye har de nå?', '535 kroner (368 + 257 = 625, og 625 − 90 = 535)')
    const withoutCarry = text(3, 'En klasse har 320 kroner. De får 150 kroner til og bruker 90 kroner på frukt. Hvor mye har de nå?', '380 kroner (320 + 150 = 470, og 470 − 90 = 380)')
    // Uten skrevet utregning: tallene i teksten som gir svaret, avgjør.
    const implicit = text(3, 'Lise har 467 klistremerker og får 285 til av bestemor. Etterpå gir hun 100 til broren sin. Hvor mange har hun da?', '652')
    // Veksling bare i subtraksjonen (805 − 316), ikke i addisjonen (489 + 110).
    const subtractionCarryOnly = text(3, 'Det er 805 elever på skolen. 316 av dem går hjem, og 110 nye kommer. Hvor mange er det da?', '599 (805 − 316 = 489, og 489 + 110 = 599)')
    assert.equal(requiresCarry(withCarry), true)
    assert.equal(requiresCarry(withoutCarry), false)
    assert.equal(requiresCarry(implicit), true)
    assert.equal(requiresCarry(subtractionCarryOnly), false)
    const checked = accepted(carrySession, [withCarry, withoutCarry, implicit, subtractionCarryOnly])
    assert.equal(checked.removed.missingCarry, 2)
    assert.equal(checked.accepted.length, 2)
  })

  it('grunnoppgavene i økta har tierovergang på alle nivåer, med støtte på nivå 1', () => {
    for (const t of carrySession.tasks as Task[]) assert.ok(t.operator === '+' && additionHasCarry(t.a, t.b), `nivå ${t.level}: ${t.a} + ${t.b}`)
    for (const t of carrySession.tasks.filter((x) => x.level === 1) as Task[]) assert.match(t.instruction, /Fyll først opp til nærmeste tier/)
    assert.ok(carrySession.levels.every((l) => !/uten tierovergang/i.test(`${l.subtitle} ${l.description}`)))
  })

  it('prompten sier at alle oppgavene skal ha tierovergang, og nivå 1 blir lettere ved tall og støtte', () => {
    const prompt = taskPrompt(request(carrySession))
    assert.ok(prompt.includes('Alle oppgavene skal kreve addisjon med tierovergang'))
    assert.ok(prompt.includes('ikke ved å fjerne tierovergangen'))
    assert.ok(!taskPrompt(request(mock('okt-4'))).includes('Alle oppgavene skal kreve addisjon med tierovergang'))
  })

  it('6. «Andre ønsker: Lag oppgaver om avrunding» endrer ikke fagområdet eller kravet om tierovergang', () => {
    const wishes = 'Lag oppgaver om avrunding'
    const checked = accepted(carrySession, [text(1, 'Rund av 47 til nærmeste tier.', '50'), math(1, 24, 13), math(1, 37, 6)], wishes)
    assert.equal(checked.removed.offTopic, 1)
    assert.equal(checked.removed.missingCarry, 1)
    assert.equal(checked.accepted.length, 1)
    assert.ok(taskPrompt(request(carrySession, wishes)).includes('Fagområde: Addisjon og subtraksjon'))
  })

  it('9. andre økter påvirkes ikke: 24 + 13 godkjennes i økta om smarte regnestrategier', () => {
    const other = mock('okt-1-2')
    const checked = accepted(other, [math(1, 24, 13, '+', 'Regn ut.')])
    assert.equal(checked.removed.missingCarry, 0)
    assert.equal(checked.accepted.length, 1)
  })
})

describe('intern systemtekst vises ikke', () => {
  it('kjenner igjen interne ord, men ikke vanlig pedagogisk språk', () => {
    for (const internal of ['Reservekandidat for nivå 3', 'Dette er en reserveoppgave.', 'Laget i utfyllingsforsøk 2.', 'refill', 'Svaret kom fra fallback.', 'Reservemodellen ble brukt.', 'Se prompten.', 'Bygger på referanse-ID M4-N2-01.', 'Bygger på T3-N2-01.', 'Kandidat 4 av 6.']) {
      assert.ok(containsInternalText(internal), internal)
    }
    for (const fine of ['Utfylling med støtte på nivå 1.', 'Nivå 3: Flertrinnsoppgave med større tall som krever veksling.', 'Fyll først opp til nærmeste tier.']) {
      assert.ok(!containsInternalText(fine), fine)
    }
  })

  it('7. «Reservekandidat …» fjernes fra tilpasningen og erstattes med en pedagogisk forklaring', () => {
    const candidate = math(3, 2640, 1570, '+', 'Regn ut.')
    const checked = accepted(carrySession, [{ ...candidate, adaptation: 'Reservekandidat for nivå 3 med flere trinn og operasjoner.' }])
    assert.equal(checked.accepted.length, 1)
    const adaptation = checked.accepted[0].adaptation
    assert.ok(!containsInternalText(adaptation), adaptation)
    assert.match(adaptation, /^Nivå 3: /)
    // Blandet: den pedagogiske delen beholdes.
    const mixed = accepted(carrySession, [{ ...candidate, adaptation: 'Nivå 3: Store tall med veksling i hundrerplassen. Dette er en reservekandidat.' }])
    assert.equal(mixed.accepted[0].adaptation, 'Nivå 3: Store tall med veksling i hundrerplassen.')
  })

  it('7. interne ord i oppgavetekst eller fasit gjør at oppgaven ikke leveres', () => {
    const checked = accepted(carrySession, [
      text(2, 'Reserveoppgave: Ola har 47 kort og får 38 til. Hvor mange har han?', '85'),
      text(2, 'Ola har 46 kort og får 39 til. Hvor mange har han?', '85 (kandidat 3)'),
    ])
    assert.equal(checked.removed.internalText, 2)
    // Gjelder også økter uten referansebank (tall-5 hadde ikke det før; her en økt uten område).
    const plain = checkCandidates([text(1, 'Reservekandidat: 5 + 5', '10')], { ...request(carrySession), profile: undefined, levels: [] })
    assert.equal(plain.removed.internalText, 1)
  })

  it('8. utfyllingen leverer nøyaktig bestilt antall – uten intern tekst i noen synlige felt', async () => {
    const raw = (nivaa: AiLevel, tall1: number, tall2: number, tilpasning = 'Nivå med støtte.') => ({
      nivaa,
      format: 'regnestykke',
      oppgavetype: 'Hoderegning',
      instruksjon: 'Regn ut. Fyll først opp til nærmeste tier.',
      tall1,
      regneart: '+',
      tall2,
      oppgavetekst: '',
      fasit: '',
      kompetansemaal: '',
      tilpasning,
    })
    const responses = [
      // 24 + 13 og 52 + 31 har ingen tierovergang; 39 + 4 har en intern tilpasningstekst.
      [raw(1, 24, 13), raw(1, 39, 4, 'Reservekandidat for nivå 1.'), raw(1, 52, 31), raw(2, 57, 26), raw(2, 168, 47), raw(3, 2650, 1480), raw(3, 3870, 2350)],
      [raw(1, 57, 6), raw(1, 66, 8)],
    ]
    let calls = 0
    const logs: AiLogEntry[] = []
    const generate = async (): Promise<GenerateResult> => {
      const body = JSON.stringify({ melding: 'Utfyllingsforsøk 1 ga to reservekandidater. Oppgavene følger nivåene.', oppgaver: responses[Math.min(calls++, responses.length - 1)] })
      return { text: body, content: { role: 'model', parts: [{ text: body }] }, model: aiConfig.primaryModel, fallbackUsed: false }
    }
    const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newSeed: () => 2 })
    const result = await handler({ ...request(carrySession), levels: buildLevelContexts(carrySession.levels, carrySession.tasks, carrySession.profile) }, { uid: 'l', classId: '4A' })
    assert.equal(calls, 2)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    for (const t of result.tasks) assert.ok(t.format !== 'math' || additionHasCarry(t.a, t.b), `${t.format === 'math' && `${t.a} + ${t.b}`}`)
    const visible = JSON.stringify({ message: result.message, warning: result.warning, tasks: result.tasks.map((t) => ({ ...t, servedBy: undefined })) })
    assert.ok(!containsInternalText(visible), visible)
    assert.equal(result.message, 'Oppgavene følger nivåene.')
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.removed_missingCarry, 2)
    assert.equal(final.delivered, true)
  })

  it('prompten ber modellen holde interne ord ute av synlige felt', () => {
    const prompt = taskPrompt(request(carrySession))
    assert.ok(prompt.includes('Feltene oppgavetekst, fasit, tilpasning og melding vises for læreren eller eleven'))
    assert.ok(!/reservekandidat/i.test(prompt))
  })
})
