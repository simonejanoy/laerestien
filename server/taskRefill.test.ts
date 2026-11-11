// Tester for reservekandidater og målrettet utfylling ved generering av generelle oppgaver:
// læreren får enten nøyaktig det bestilte antallet per nivå, eller ingen oppgaver.
// Ingen ekte Gemini-kall. Kjør: npm test

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { GenerateContentResponse, type GenerateContentParameters } from '@google/genai'
import { aiConfig } from '../src/ai/config.ts'
import type { AiLevel, TaskRequest, TaskResult } from '../src/ai/contract.ts'
import { isCompletePackage, toSessionTask } from '../src/ai/drafts.ts'
import { readMeta } from '../src/ai/contract.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { levelsFor, planned, type Planned } from '../src/features/sessions/sessionTasks.ts'
import type { SessionTask } from '../src/types/index.ts'
import { createGenerate, type AiLogEntry, type GenerateResult } from './gemini.ts'
import { multiplicationBankFile } from './references/multiplication.ts'
import { createTaskHandler, type GenerateCallOptions } from './taskHandler.ts'

const plan = (id: string) => planned('multiplikasjon').find((p) => p.id === id)!
const teacher = { uid: 'lærer', classId: '4A' }
const PRIMARY = aiConfig.primaryModel
const FALLBACK = aiConfig.fallbackModel

function appRequest(p: Planned, existing: SessionTask[] = [], wishes = '', perLevel = 2): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: p.spec.topic, sessionHeading: p.heading, sessionDescription: p.spec.description, sessionGoals: p.spec.goals },
    perLevel,
    officialGoals: '',
    wishes,
    levels: buildLevelContexts(levelsFor(p, 5, 6), existing, p.profile),
    profile: toAiProfile(p.profile!),
  }
}

type Raw = Record<string, unknown>
/** Regnestykke i Gemini-format. «Regn ut.» har ingen strategi, så strategikontrollen slipper det gjennom. */
const fact = (nivaa: AiLevel, tall1: number, tall2: number, instruksjon = 'Regn ut.'): Raw => ({ nivaa, tall1, tall2, instruksjon })
const json = (tasks: Raw[]) =>
  JSON.stringify({
    melding: '',
    oppgaver: tasks.map((t) => ({ format: 'regnestykke', oppgavetype: 'Hoderegning', regneart: '·', oppgavetekst: '', fasit: '', kompetansemaal: '', tilpasning: '', ...t })),
  })

interface Scripted {
  tasks: Raw[]
  model?: string
  fallbackUsed?: boolean
}

/** Falsk Gemini som svarer etter manus, ett svar per kall. Registrerer prompt og modellvalg. */
function scripted(responses: Scripted[]) {
  const calls: { prompt: string; options?: GenerateCallOptions }[] = []
  const logs: AiLogEntry[] = []
  const generate = async (_use: string, contents: { parts?: { text?: string }[] }[], _schema?: unknown, _trace?: AiLogEntry, options?: GenerateCallOptions): Promise<GenerateResult> => {
    const r = responses[Math.min(calls.length, responses.length - 1)]
    calls.push({ prompt: contents[0]?.parts?.[0]?.text ?? '', options })
    const text = json(r.tasks)
    return { text, content: { role: 'model', parts: [{ text }] }, model: r.model ?? PRIMARY, fallbackUsed: r.fallbackUsed ?? false }
  }
  const handler = createTaskHandler({ generate: generate as never, log: (e) => logs.push(e), newRequestId: () => 'req-refill', newSeed: () => 3 })
  return { handler, calls, logs }
}

const perLevelCount = (result: TaskResult) => [1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length)
const facts = (result: TaskResult) => result.tasks.map((t) => (t.format === 'math' ? `${t.level}:${t.a}·${t.b}` : `${t.level}:tekst`))

/** Eksisterende oppgave i oppgavesettet: 7 · 8 på nivå 2. */
const existing: SessionTask[] = [{ id: 'x', level: 2, type: 'Hoderegning', instruction: 'Regn ut.', a: 7, operator: '*', b: 8, source: 'teacher' }]

describe('reservekandidater', () => {
  it('første bestilling ber om én reservekandidat per nivå', async () => {
    const { handler, calls } = scripted([{ tasks: [fact(1, 3, 7), fact(1, 4, 7), fact(2, 6, 8), fact(2, 5, 9), fact(3, 6, 9), fact(3, 8, 7)] }])
    await handler(appRequest(plan('multiplikasjon-6')), teacher)
    assert.match(calls[0].prompt, /Antall: Lag 3 kandidater på hvert av nivå 1, 2 og 3\. Læreren har bestilt 2 per nivå/)
  })

  it('1 og 6. en reservekandidat erstatter et duplikat uten ny forespørsel, og ubrukte reserver returneres ikke', async () => {
    const { handler, calls } = scripted([
      { tasks: [fact(1, 3, 7), fact(1, 4, 7), fact(1, 5, 7), fact(2, 7, 8), fact(2, 6, 8), fact(2, 5, 9), fact(3, 6, 9), fact(3, 8, 7), fact(3, 9, 9)] },
    ])
    const result = await handler(appRequest(plan('multiplikasjon-6'), existing), teacher)
    assert.equal(calls.length, 1)
    assert.deepEqual(perLevelCount(result), [2, 2, 2])
    // 7 · 8 finnes fra før – reserven 5 · 9 brukes. Reservene på nivå 1 og 3 er ikke med.
    assert.deepEqual(facts(result), ['1:3·7', '1:4·7', '2:6·8', '2:5·9', '3:6·9', '3:8·7'])
  })
})

describe('målrettet utfylling', () => {
  it('2 og 4. et direkte duplikat erstattes – og utfyllingen ber bare om nivået som mangler', async () => {
    const { handler, calls } = scripted([
      { tasks: [fact(1, 3, 7), fact(1, 4, 7), fact(2, 6, 8), fact(2, 6, 8), fact(3, 6, 9), fact(3, 8, 7)] },
      { tasks: [fact(2, 5, 9), fact(2, 9, 6)] },
    ])
    const result = await handler(appRequest(plan('multiplikasjon-6')), teacher)
    assert.equal(calls.length, 2)
    assert.deepEqual(perLevelCount(result), [2, 2, 2])
    assert.deepEqual(facts(result), ['1:3·7', '1:4·7', '2:6·8', '2:5·9', '3:6·9', '3:8·7'])
    const refill = calls[1].prompt
    assert.match(refill, /Bestilling: Lag erstatningsoppgaver bare for disse nivåene: nivå 2: 2 kandidater \(mangler 1\)\./)
    assert.ok(!/nivå 1: \d+ kandidater|nivå 3: \d+ kandidater/.test(refill))
    // Det som ikke kan brukes: godkjente kandidater og duplikatet.
    assert.match(refill, /Kan ikke brukes på nivå 2[^\n]*6 · 8/)
  })

  it('3. en oppgave med byttede faktorer fjernes og erstattes, og blokkeres i utfyllingen', async () => {
    const { handler, calls } = scripted([
      { tasks: [fact(1, 3, 7), fact(1, 4, 7), fact(2, 8, 7), fact(2, 6, 8), fact(3, 6, 9), fact(3, 8, 7)] },
      { tasks: [fact(2, 9, 4), fact(2, 9, 5)] },
    ])
    const result = await handler(appRequest(plan('multiplikasjon-6'), existing), teacher)
    assert.deepEqual(perLevelCount(result), [2, 2, 2])
    assert.ok(!facts(result).includes('2:8·7'))
    // Eksisterende 7 · 8, den byttede 8 · 7 og den godkjente 6 · 8 er blokkert.
    const blocked = calls[1].prompt.match(/Kan ikke brukes på nivå 2[^\n]*/)?.[0] ?? ''
    for (const f of ['7 · 8', '8 · 7', '6 · 8']) assert.ok(blocked.includes(f), f)
    assert.ok(calls[1].prompt.includes('Byttede faktorer regnes som samme oppgave'))
  })

  it('11. erstatningene går gjennom de samme kontrollene (duplikat, tabell, strategi)', async () => {
    const { handler, calls, logs } = scripted([
      { tasks: [fact(1, 3, 7), fact(1, 4, 7), fact(2, 6, 8), fact(3, 6, 9), fact(3, 8, 7)] },
      // Duplikat av en godkjent, tabell utenfor økta og ugyldig strategi.
      { tasks: [fact(2, 8, 6), fact(2, 6, 4), fact(2, 8, 7, 'Regn ut. Ta 10-gangen minus én gruppe.')] },
      { tasks: [fact(2, 9, 3)] },
    ])
    const result = await handler(appRequest(plan('multiplikasjon-6')), teacher)
    assert.equal(calls.length, 3)
    assert.deepEqual(perLevelCount(result), [2, 2, 2])
    const first = logs.find((e) => e.event === 'general_tasks_attempt' && e.attempt === 1)!
    assert.equal(first.removed_swappedFactors ?? 0, 0)
    assert.equal(first.removed_duplicateInResponse, 1)
    assert.equal(first.removed_outsideTables, 1)
    assert.equal(first.removed_invalidStrategy, 1)
  })

  it('9 og 10. høyst to utfyllinger – og ingen delvis pakke når det fortsatt mangler', async () => {
    const { handler, calls, logs } = scripted([
      { tasks: [fact(1, 3, 7), fact(1, 4, 7), fact(2, 6, 8), fact(3, 6, 9), fact(3, 8, 7)] },
      { tasks: [fact(2, 6, 8)] },
      { tasks: [fact(2, 8, 6)] },
      { tasks: [fact(2, 9, 9)] },
    ])
    const result = await handler(appRequest(plan('multiplikasjon-6')), teacher)
    assert.equal(calls.length, 3)
    assert.deepEqual(result.tasks, [])
    assert.equal(result.incomplete, true)
    assert.match(result.warning ?? '', /klarte ikke å lage alle de 6 oppgavene/)
    assert.match(result.warning ?? '', /Ingen oppgaver ble lagt til/)
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.delivered, false)
    assert.equal(final.refillAttempts, 2)
    assert.equal(final.missingLevels, '2:1')
  })

  it('5. ender alltid med nøyaktig det bestilte antallet per nivå (3 per nivå)', async () => {
    const { handler } = scripted([
      { tasks: [fact(1, 3, 7), fact(1, 4, 7), fact(2, 6, 8), fact(2, 4, 8), fact(3, 6, 9), fact(3, 8, 7), fact(3, 9, 9)] },
      { tasks: [fact(1, 5, 7), fact(1, 5, 8), fact(2, 3, 9), fact(2, 5, 9), fact(2, 7, 9), fact(3, 4, 9), fact(3, 3, 8)] },
    ])
    const result = await handler(appRequest(plan('multiplikasjon-6'), [], '', 3), teacher)
    assert.deepEqual(perLevelCount(result), [3, 3, 3])
    assert.equal(result.incomplete, undefined)
  })
})

describe('modellbruk ved utfylling', () => {
  const short = { tasks: [fact(1, 3, 7), fact(1, 4, 7), fact(2, 6, 8), fact(3, 6, 9), fact(3, 8, 7)] }
  const fill = { tasks: [fact(2, 9, 3)] }

  it('7. modellen som svarte først, brukes til utfyllingen', async () => {
    const primary = scripted([{ ...short, model: PRIMARY }, fill])
    await primary.handler(appRequest(plan('multiplikasjon-6')), teacher)
    assert.equal(primary.calls[0].options?.startWith, undefined)
    assert.equal(primary.calls[1].options?.startWith, 'primary')

    const fallback = scripted([{ ...short, model: FALLBACK, fallbackUsed: true }, { ...fill, model: FALLBACK, fallbackUsed: true }])
    const result = await fallback.handler(appRequest(plan('multiplikasjon-6')), teacher)
    assert.equal(fallback.calls[1].options?.startWith, 'fallback')
    const refillLog = fallback.logs.find((e) => e.event === 'general_tasks_attempt' && e.attempt === 1)!
    assert.equal(refillLog.model, FALLBACK)
    // Hver oppgave har modellen som faktisk laget den.
    const tasks = result.tasks.map((t, i) => toSessionTask(t, `n${i}`, readMeta(JSON.parse(JSON.stringify(result)))))
    assert.ok(tasks.every((t) => t.aiMeta?.model === FALLBACK && t.aiMeta.fallbackUsed))
  })

  it('8. Gemini 3.8 prøves ikke på nytt når den fikk timeout og reservemodellen svarte', async () => {
    const called: string[] = []
    let n = 0
    const responses = [json(short.tasks), json(fill.tasks)]
    const callModel = async (params: GenerateContentParameters) => {
      called.push(params.model)
      if (params.model === PRIMARY) {
        return new Promise<GenerateContentResponse>((_, reject) => params.config?.abortSignal?.addEventListener('abort', () => reject(new Error('aborted'))))
      }
      const text = responses[Math.min(n++, responses.length - 1)]
      return Object.assign(new GenerateContentResponse(), { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] })
    }
    const generate = createGenerate({ callModel, timeoutMs: { primary: 30, fallback: 1_000 }, log: () => {} })
    const handler = createTaskHandler({ generate, log: () => {} })
    const result = await handler(appRequest(plan('multiplikasjon-6')), teacher)
    assert.deepEqual(called, [PRIMARY, FALLBACK, FALLBACK])
    assert.deepEqual(perLevelCount(result), [2, 2, 2])
  })
})

describe('ønsker, logging og uendrede regler', () => {
  it('12. «Andre ønsker» følger med i utfyllingen og kan fortsatt slippe gjennom tekstoppgaver', async () => {
    const wishes = 'Lag tekstoppgaver om å kjøpe ting'
    const story = (nivaa: AiLevel, n: number): Raw => ({ nivaa, format: 'tekst', oppgavetekst: `Lise kjøper ${n} pakker med 8 klistremerker. Hvor mange får hun? Hvor mange får hun med én pakke til?`, fasit: `${n * 8}` })
    const { handler, calls } = scripted([
      { tasks: [story(1, 3), story(1, 4), story(2, 5), story(3, 6), story(3, 7)] },
      { tasks: [story(2, 9)] },
    ])
    const result = await handler(appRequest(plan('multiplikasjon-6'), [], wishes), teacher)
    assert.deepEqual(perLevelCount(result), [2, 2, 2])
    assert.ok(result.tasks.every((t) => t.format !== 'math'))
    assert.ok(calls.every((c) => c.prompt.includes(`Ekstra ønsker fra læreren: ${wishes}`)))
  })

  it('loggen viser bestilt antall, kandidater, fjernet med årsak, manglende nivåer, forsøk, modell og resultat – uten fritekst', async () => {
    const SECRET = 'HEMMELIG-ØNSKE-Kari'
    const { handler, logs } = scripted([
      { tasks: [fact(1, 3, 7), fact(1, 4, 7), fact(2, 6, 8), fact(2, 6, 8), fact(3, 6, 9), fact(3, 8, 7)] },
      { tasks: [fact(2, 5, 9)] },
    ])
    await handler(appRequest(plan('multiplikasjon-6'), [], SECRET), teacher)
    assert.ok(!JSON.stringify(logs).includes(SECRET))
    const [first, refill] = logs.filter((e) => e.event === 'general_tasks_attempt')
    assert.equal(first.attempt, 0)
    assert.equal(first.requested, '1:3,2:3,3:3')
    assert.equal(first.received, 6)
    assert.equal(first.removed_duplicateInResponse, 1)
    assert.equal(first.missingLevels, '2:1')
    assert.equal(first.approved, '1:2,2:1,3:2')
    assert.equal(refill.attempt, 1)
    assert.equal(refill.requested, '2:2')
    assert.equal(refill.model, PRIMARY)
    assert.equal(refill.approved, '1:2,2:2,3:2')
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.orderedPerLevel, 2)
    assert.equal(final.delivered, true)
    assert.equal(final.returned, 6)
    assert.equal(final.refillAttempts, 1)
  })

  it('appen legger bare til en komplett pakke', () => {
    const draft = (level: AiLevel) => ({ level, studentText: 'x', solution: 'y', competenceGoal: '', adaptation: '' })
    assert.equal(isCompletePackage([draft(1), draft(1), draft(2), draft(2), draft(3), draft(3)], 2), true)
    assert.equal(isCompletePackage([draft(1), draft(1), draft(2), draft(3), draft(3)], 2), false)
    assert.equal(isCompletePackage([draft(1), draft(1), draft(1), draft(2), draft(2), draft(3)], 2), false)
    assert.equal(isCompletePackage([], 2), false)
    const page = readFileSync(new URL('../src/features/tasks/AiTaskGenerator.tsx', import.meta.url), 'utf8')
    assert.ok(page.includes('isCompletePackage('))
  })

  it('13. regelversjon 8 og referansebanken er uendret', () => {
    assert.equal(aiConfig.rulesVersion, '8')
    const hash = createHash('sha256').update(readFileSync(multiplicationBankFile)).digest('hex')
    assert.equal(hash, '4e3e3970c12f95a663fc0ea355e56713f112a5a5b03549a226df8ac4495317c1')
  })
})
