// Tester for strategistøtte i strategiøkter (økt 5 og 6 i Multiplikasjon) og for tidsgrensen
// før reservemodellen ved oppgavegenerering. Ingen ekte Gemini-kall. Kjør: npm test

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GenerateContentResponse, type Content, type GenerateContentParameters } from '@google/genai'
import { aiConfig, timeoutsFor } from '../src/ai/config.ts'
import type { AiTaskDraft, TaskRequest, TaskResult } from '../src/ai/contract.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { buildTasks, levelsFor, mergeTasks, planned, type Planned } from '../src/features/sessions/sessionTasks.ts'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks.ts'
import { OPEN_STRATEGY, strategyInstruction, strategyProblem } from '../src/features/topics/multiplicationStrategies.ts'
import type { Level, SessionTask, Task } from '../src/types/index.ts'
import { createGenerate, type AiLogEntry, type ModelCaller } from './gemini.ts'
import { taskPrompt } from './prompts.ts'
import { multiplicationReferences } from './references/multiplication.ts'
import { selectReferences, toAiReference } from './references/selectReferences.ts'
import { checkGeneralResult } from './taskChecks.ts'

const plans = planned('multiplikasjon')
const plan = (id: string) => plans.find((p) => p.id === id)!
const tasksOf = (p: Planned) => mergeTasks(worksheetTasks[p.id] ?? [], buildTasks(p))
const isMath = (t: SessionTask): t is Task => t.kind !== 'text'

/** Bestillingen slik serveren har den etter at referansene er valgt. */
function request(p: Planned, wishes = '', existing: SessionTask[] = tasksOf(p)): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: p.spec.topic, sessionHeading: p.heading, sessionDescription: p.spec.description, sessionGoals: p.spec.goals },
    perLevel: 3,
    officialGoals: '',
    wishes,
    levels: buildLevelContexts(levelsFor(p, 5, 6), existing, p.profile).map((l) => ({
      ...l,
      referenceTasks: selectReferences(multiplicationReferences, { area: p.profile!.area!, level: l.level, seed: 1 }).map(toAiReference),
    })),
    profile: toAiProfile(p.profile!),
  }
}
const math = (level: Level, a: number, b: number, instruction: string): AiTaskDraft => ({
  format: 'math',
  level,
  taskType: 'Hoderegning',
  instruction,
  a,
  operator: '*',
  b,
  competenceGoal: '',
  adaptation: '',
})
const check = (p: Planned, tasks: AiTaskDraft[], wishes = '', existing?: SessionTask[]) =>
  checkGeneralResult({ tasks, message: '' } as TaskResult, request(p, wishes, existing))

describe('strategiinstruksjoner er matematisk gyldige', () => {
  it('«10-gangen minus én gruppe» passer 9-gangen, ikke 8 · 7', () => {
    assert.ok(strategyProblem('Regn ut. Doble 4-gangen, eller ta 10-gangen minus én gruppe.', 8, 7))
    assert.equal(strategyProblem('Regn ut. Ta 10-gangen minus to grupper.', 8, 7), null)
    assert.equal(strategyProblem('Regn ut. Bruk 10-gangen og trekk fra én gruppe.', 6, 9), null)
    assert.ok(strategyProblem('Regn ut. Bruk 10-gangen og trekk fra én gruppe.', 6, 8))
    assert.ok(strategyProblem('Regn ut. Bruk 5-gangen og legg til to grupper.', 6, 8))
    assert.ok(strategyProblem('Regn ut. Doble 3-gangen.', 4, 7))
  })

  it('konkrete mellomsteg må gi akkurat produktet', () => {
    assert.equal(strategyProblem('Regn ut. Tenk 10 · 6 og trekk fra 6.', 6, 9), null)
    assert.ok(strategyProblem('Regn ut. Tenk 10 · 6 og trekk fra 6.', 6, 8))
    assert.equal(strategyProblem('Regn ut. Finn 4 · 6 og doble svaret.', 6, 8), null)
    assert.ok(strategyProblem('Regn ut. Finn 4 · 6 og doble svaret.', 6, 7))
    assert.equal(strategyProblem('Regn ut. Finn 5 · 8 og legg til 2 · 8.', 8, 7), null)
    assert.ok(strategyProblem('Regn ut. Finn 5 · 8 og legg til 8.', 8, 7))
  })

  it('instruksjonene appen lager er gyldige for alle stykker i 6- til 9-gangen, begge veier og på alle nivåer', () => {
    for (const level of [1, 2, 3] as const) {
      for (const table of [6, 7, 8, 9]) {
        for (let g = 0; g <= 10; g++) {
          for (const [a, b] of [[g, table], [table, g]]) {
            const instruction = strategyInstruction(level, a, b)
            assert.ok(instruction, `${a} · ${b}`)
            assert.equal(strategyProblem(instruction, a, b), null, `nivå ${level}: ${a} · ${b}: ${instruction}`)
          }
        }
      }
    }
    // Ingen egen strategi for tabeller uten strategifokus.
    assert.equal(strategyInstruction(1, 3, 4), null)
  })

  it('ingen grunnoppgave i økt 5 og 6 har en ugyldig strategi – heller ikke 8 · 7', () => {
    for (const id of ['multiplikasjon-5', 'multiplikasjon-6']) {
      for (const task of tasksOf(plan(id)).filter(isMath)) {
        assert.equal(strategyProblem(task.instruction, task.a, task.b), null, `${id} nivå ${task.level}: ${task.a} · ${task.b} – ${task.instruction}`)
      }
    }
    const eightSeven = tasksOf(plan('multiplikasjon-6')).filter(isMath).filter((t) => (t.a === 8 && t.b === 7) || (t.a === 7 && t.b === 8))
    assert.ok(eightSeven.length > 0)
    assert.ok(eightSeven.every((t) => !/minus én gruppe/.test(t.instruction)))
  })
})

describe('nivå 1–3 beholder forskjellen i støtte i økt 6', () => {
  const tasks = tasksOf(plan('multiplikasjon-6')).filter(isMath)
  const onLevel = (level: Level) => tasks.filter((t) => t.level === level)

  it('nivå 1 gir konkret hjelp med tallene i stykket', () => {
    for (const t of onLevel(1)) assert.match(t.instruction, /(Finn|Tenk) \d+ · \d+ og (doble|legg til|trekk fra)/, `${t.a} · ${t.b}`)
  })

  it('nivå 2 foreslår en strategi i ord, uten ferdig mellomsteg', () => {
    for (const t of onLevel(2)) {
      assert.match(t.instruction, /gangen/, `${t.a} · ${t.b}`)
      assert.doesNotMatch(t.instruction, /\d+ · \d+/, `${t.a} · ${t.b}`)
    }
  })

  it('nivå 3 er åpen og gir en reell utfordring (ikke 0, 1 eller 2 som faktor, ikke 1 · 7)', () => {
    assert.ok(onLevel(3).length >= 5)
    for (const t of onLevel(3)) {
      assert.equal(t.instruction, OPEN_STRATEGY)
      assert.ok(t.a > 2 && t.b > 2, `${t.a} · ${t.b}`)
    }
    assert.ok(!onLevel(3).some((t) => (t.a === 1 && t.b === 7) || (t.a === 7 && t.b === 1)))
  })

  it('økter uten strategifokus får ikke strategitekst', () => {
    for (const id of ['multiplikasjon-3', 'multiplikasjon-4', 'multiplikasjon-7']) {
      assert.ok(!plan(id).profile?.strategyFocus, id)
      for (const t of tasksOf(plan(id)).filter(isMath)) assert.ok(!/Velg en smart strategi|og doble svaret|minus to grupper/.test(t.instruction), `${id}: ${t.instruction}`)
    }
  })
})

describe('AI-oppgaver i økt 6 følger tema, nivå og støttestruktur', () => {
  it('prompten beskriver støtten på hvert nivå og krever gyldige strategier', () => {
    const prompt = taskPrompt(request(plan('multiplikasjon-6')))
    assert.match(prompt, /Nivå 1[\s\S]*Støttestruktur i instruksjonen på nivået: Konkret hjelp/)
    assert.match(prompt, /Nivå 2[\s\S]*Støttestruktur i instruksjonen på nivået: Foreslå én eller flere gyldige strategier/)
    assert.match(prompt, /Nivå 3[\s\S]*Støttestruktur i instruksjonen på nivået: Åpen formulering/)
    assert.ok(prompt.includes('En strategi i instruksjonen må være matematisk gyldig for akkurat det regnestykket du lager.'))
    assert.ok(prompt.includes('trenger ikke introdusere ny strategi'))
    // Bare strategiøkter får strategireglene.
    const plain = taskPrompt(request(plan('multiplikasjon-3')))
    assert.ok(!plain.includes('Støttestruktur') && !plain.includes('En strategi i instruksjonen'))
  })

  it('en ny hoderegningsoppgave med gyldig støtte for nivået beholdes', () => {
    const checked = check(plan('multiplikasjon-6'), [
      math(1, 6, 8, 'Regn ut. Finn 4 · 6 og doble svaret.'),
      math(2, 4, 9, 'Regn ut. Bruk 10-gangen og trekk fra én gruppe.'),
      math(3, 8, 8, OPEN_STRATEGY),
    ], '', [])
    assert.equal(checked.result.tasks.length, 3)
    assert.ok(Object.values(checked.removed).every((n) => n === 0))
  })

  it('ugyldig strategi eller tabell utenfor økta tas bort, med beskjed til læreren', () => {
    const checked = check(plan('multiplikasjon-6'), [
      math(2, 8, 7, 'Regn ut. Ta 10-gangen minus én gruppe.'),
      math(1, 6, 8, 'Regn ut. Tenk 10 · 6 og trekk fra 6.'),
      math(2, 6, 4, 'Regn ut.'),
      math(2, 9, 6, 'Regn ut. Bruk 10-gangen og trekk fra én gruppe.'),
    ], '', [])
    assert.equal(checked.removed.invalidStrategy, 2)
    assert.equal(checked.removed.outsideTables, 1)
    assert.equal(checked.result.tasks.length, 1)
    assert.match(checked.warning ?? '', /2 som hadde en strategi som ikke passet regnestykket/)
  })

  it('duplikat- og kopifiltrene virker fortsatt i strategiøkta', () => {
    const existing = tasksOf(plan('multiplikasjon-6'))
    const first = existing.filter(isMath).find((t) => t.level === 2 && t.a !== t.b && t.a > 0 && t.b > 0)!
    const checked = check(plan('multiplikasjon-6'), [
      math(2, first.a, first.b, first.instruction),
      // Byttede faktorer med samme strategistøtte er samme oppgave.
      math(2, first.b, first.a, strategyInstruction(2, first.b, first.a)!),
      math(2, 9, 9, 'Regn ut. Bruk 10-gangen og trekk fra én gruppe.'),
      math(2, 9, 9, 'Regn ut. Bruk 10-gangen og trekk fra én gruppe.'),
    ])
    assert.equal(checked.removed.duplicateInSet, 1)
    assert.equal(checked.removed.swappedFactors, 1)
    assert.equal(checked.removed.duplicateInResponse, 1)
  })
})

describe('«Andre ønsker» påvirker fortsatt formatet', () => {
  const story: AiTaskDraft = {
    level: 2,
    studentText: 'Lise kjøper 7 pakker med 8 klistremerker. Hvor mange får hun? Hvor mange får hun hvis hun kjøper én pakke til?',
    solution: '56 og 64',
    competenceGoal: '',
    adaptation: '',
  }

  it('uten ønsker tas en lengre tekstoppgave bort i den korte regneøkta', () => {
    assert.equal(check(plan('multiplikasjon-6'), [story]).removed.format, 1)
  })

  it('med ønske om tekstoppgaver beholdes den, og ønsket står i bestillingen', () => {
    const wishes = 'Lag tekstoppgaver om å kjøpe ting'
    const checked = check(plan('multiplikasjon-6'), [story], wishes)
    assert.equal(checked.result.tasks.length, 1)
    assert.ok(taskPrompt(request(plan('multiplikasjon-6'), wishes)).includes(`Ekstra ønsker fra læreren: ${wishes}`))
  })
})

describe('tidsgrense før reservemodellen', () => {
  const contents: Content[] = [{ role: 'user', parts: [{ text: 'Lag oppgaver' }] }]
  const ok = (text: string) =>
    Object.assign(new GenerateContentResponse(), { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] })

  /** Primærmodellen henger til den avbrytes; reservemodellen svarer. Registrerer rekkefølgen. */
  function hangingPrimary() {
    const events: string[] = []
    const callModel: ModelCaller = async (params: GenerateContentParameters) => {
      events.push(`start ${params.model}`)
      if (params.model === aiConfig.primaryModel) {
        return new Promise((_, reject) =>
          params.config?.abortSignal?.addEventListener('abort', () => {
            events.push(`avbrutt ${params.model}`)
            reject(new Error('aborted'))
          }),
        )
      }
      return ok('svar')
    }
    return { events, callModel }
  }

  it('konfigurasjonen: 4 sekunder for oppgaver, uendret for profil og chat', () => {
    assert.deepEqual(timeoutsFor('tasks'), { primary: 4_000, fallback: 20_000 })
    assert.deepEqual(timeoutsFor('profile'), { primary: 12_000, fallback: 20_000 })
    assert.deepEqual(timeoutsFor('chat'), { primary: 12_000, fallback: 20_000 })
    assert.equal(aiConfig.primaryModel, 'gemini-3.8-flash')
    assert.equal(aiConfig.fallbackModel, 'gemini-3.5-flash-lite')
  })

  it('Gemini 3.8 Flash avbrytes etter omtrent 4 sekunder for oppgaver, og reservemodellen startes etterpå', async () => {
    const { events, callModel } = hangingPrimary()
    const logs: AiLogEntry[] = []
    const generate = createGenerate({ callModel, log: (e) => logs.push(e) })
    const started = Date.now()
    const result = await generate('tasks', contents)
    const elapsed = Date.now() - started
    assert.ok(elapsed >= 3_950 && elapsed < 4_800, `brukte ${elapsed} ms`)
    assert.equal(result.fallbackUsed, true)
    assert.equal(result.model, aiConfig.fallbackModel)
    // Ikke parallelt, og ingen ekstra forsøk: primær avbrytes før reserven startes, ett kall hver.
    assert.deepEqual(events, [`start ${aiConfig.primaryModel}`, `avbrutt ${aiConfig.primaryModel}`, `start ${aiConfig.fallbackModel}`])
    assert.deepEqual(
      logs.map((e) => [e.role ?? '-', e.outcome, e.timeoutMs ?? '-']),
      [
        ['primary', 'timeout', 4_000],
        ['fallback', 'ok', 20_000],
        ['-', 'answered', '-'],
      ],
    )
  })

  it('profil og chat bruker fortsatt 12 sekunder for primærmodellen', async () => {
    for (const use of ['profile', 'chat'] as const) {
      const logs: AiLogEntry[] = []
      const generate = createGenerate({ callModel: async () => ok('svar'), log: (e) => logs.push(e) })
      await generate(use, contents)
      assert.equal(logs[0].timeoutMs, 12_000, use)
      assert.equal(logs[0].role, 'primary')
    }
  })

  it('profil avbrytes ikke etter 4 sekunder (skalert: grensene per bruk følges)', async () => {
    // Grensene fra konfigurasjonen, delt på 100, så testen går raskt.
    const scaled = (use: 'tasks' | 'profile' | 'chat') => ({ primary: timeoutsFor(use).primary / 100, fallback: timeoutsFor(use).fallback / 100 })
    const { callModel } = hangingPrimary()
    const logs: AiLogEntry[] = []
    const generate = createGenerate({ callModel, timeoutMs: scaled, log: (e) => logs.push(e) })
    const started = Date.now()
    await generate('profile', contents)
    assert.ok(Date.now() - started >= 115, 'profil skal vente 12 s-tilsvarende (120 ms)')
    assert.equal(logs[0].timeoutMs, 120)
  })
})
