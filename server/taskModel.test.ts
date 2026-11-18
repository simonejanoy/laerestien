// Modellflyten for oppgavegenerering: gemini-3.5-flash-lite brukes direkte – ingen kall til Gemini 3.8 Flash først,
// ingen ventetid på primærmodellen og ingen melding om reservemodell. Elevforslag og chat har primær- og reservemodell
// som før. Ingen ekte Gemini-kall. Kjør: npm test

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { ApiError, GenerateContentResponse, type GenerateContentParameters } from '@google/genai'
import { aiConfig } from '../src/ai/config.ts'
import type { AiLevel, TaskRequest } from '../src/ai/contract.ts'
import { buildLevelContexts, toAiProfile } from '../src/ai/referenceTasks.ts'
import { levelsFor, planned } from '../src/features/sessions/sessionTasks.ts'
import { HttpError } from './errors.ts'
import { UNAVAILABLE_MESSAGE, createGenerate, type AiLogEntry } from './gemini.ts'
import { createTaskHandler } from './taskHandler.ts'

const FLASH_LITE = 'gemini-3.5-flash-lite'
const FLASH = 'gemini-3.8-flash'
const teacher = { uid: 'lærer', classId: '4A' }
const plan = planned('multiplikasjon').find((p) => p.id === 'multiplikasjon-6')!

function generalRequest(perLevel = 2): Extract<TaskRequest, { kind: 'general' }> {
  return {
    kind: 'general',
    lesson: { subject: 'Matematikk', grade: '4. trinn', topic: plan.spec.topic, sessionHeading: plan.heading, sessionDescription: plan.spec.description, sessionGoals: plan.spec.goals },
    perLevel,
    officialGoals: '',
    wishes: '',
    levels: buildLevelContexts(levelsFor(plan, 5, 6), [], plan.profile),
    profile: toAiProfile(plan.profile!),
  }
}

type Raw = Record<string, unknown>
const fact = (nivaa: AiLevel, tall1: number, tall2: number): Raw => ({ nivaa, tall1, tall2, instruksjon: 'Regn ut.' })
const json = (tasks: Raw[]) =>
  JSON.stringify({
    melding: '',
    oppgaver: tasks.map((t) => ({ format: 'regnestykke', oppgavetype: 'Hoderegning', regneart: '·', oppgavetekst: '', fasit: '', kompetansemaal: '', tilpasning: '', ...t })),
  })
const reply = (text: string) =>
  Object.assign(new GenerateContentResponse(), { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] })

/**
 * Den ekte generate-funksjonen med en falsk modell. Gemini 3.8 Flash henger til den avbrytes (som ved timeout), så et
 * kall dit ville gitt ventetid. Flash-Lite svarer etter manus.
 */
function realFlow(responses: string[], timeoutMs = { primary: 200, fallback: 1_000 }) {
  const called: string[] = []
  const logs: AiLogEntry[] = []
  let n = 0
  const callModel = async (params: GenerateContentParameters) => {
    called.push(params.model)
    if (params.model === FLASH) {
      return new Promise<GenerateContentResponse>((_, reject) => params.config?.abortSignal?.addEventListener('abort', () => reject(new Error('aborted'))))
    }
    return reply(responses[Math.min(n++, responses.length - 1)])
  }
  const generate = createGenerate({ callModel, timeoutMs, log: (e) => logs.push(e) })
  const handler = createTaskHandler({ generate, log: (e) => logs.push(e), newRequestId: () => 'req-modell', newSeed: () => 3 })
  return { handler, called, logs }
}

const full = [fact(1, 3, 7), fact(1, 4, 7), fact(1, 5, 7), fact(2, 6, 8), fact(2, 4, 8), fact(2, 7, 8), fact(3, 6, 9), fact(3, 8, 7), fact(3, 9, 9)]

describe('oppgavegenerering bruker gemini-3.5-flash-lite direkte', () => {
  it('10. konfigurasjonen: oppgavemodellen er gemini-3.5-flash-lite', () => {
    assert.equal(aiConfig.taskModel, FLASH_LITE)
    // Elevforslag og chat beholder primær- og reservemodell.
    assert.equal(aiConfig.primaryModel, FLASH)
    assert.equal(aiConfig.fallbackModel, FLASH_LITE)
  })

  it('10. generelle oppgaver går rett til gemini-3.5-flash-lite', async () => {
    const { handler, called } = realFlow([json(full)])
    const result = await handler(generalRequest(), teacher)
    assert.deepEqual(called, [FLASH_LITE])
    assert.equal(result.meta?.model, FLASH_LITE)
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
  })

  it('11. Gemini 3.8 Flash kalles ikke først, og det er ingen ventetid på den', async () => {
    // Primærmodellen henger: hadde den blitt prøvd først, ville kallet tatt minst tidsgrensen (her 400 ms).
    const { handler, called } = realFlow([json(full)], { primary: 400, fallback: 1_000 })
    const started = Date.now()
    await handler(generalRequest(), teacher)
    assert.ok(Date.now() - started < 300, `for treg: ${Date.now() - started} ms`)
    assert.ok(!called.includes(FLASH))
  })

  it('11. «Juster med AI» går også rett til gemini-3.5-flash-lite', async () => {
    const text = JSON.stringify({ melding: 'Endret.', oppgaver: [{ nivaa: 1, format: 'tekst', oppgavetekst: 'Ola har 3 poser med 4 epler. Hvor mange epler har han?', fasit: '12', kompetansemaal: '', tilpasning: '' }] })
    const { handler, called } = realFlow([text])
    const result = await handler(
      {
        kind: 'revise',
        context: { subject: 'Matematikk', grade: '4. trinn', topic: 'Multiplikasjon' },
        task: { level: 1, format: 'text', studentText: 'Ola har 3 poser med 5 epler. Hvor mange epler har han?', solution: '15', competenceGoal: '', adaptation: '' },
        instruction: 'Bruk 4 epler i hver pose.',
      },
      teacher,
    )
    assert.deepEqual(called, [FLASH_LITE])
    assert.equal(result.tasks.length, 1)
  })

  it('12. ingen melding om reservemodell ved normal oppgavegenerering', async () => {
    const { handler, logs } = realFlow([json(full)])
    const result = await handler(generalRequest(), teacher)
    // Appen viser reservemeldingen (fallbackNotice i ai/client.ts) bare når fallbackUsed er true.
    assert.equal(result.meta?.fallbackUsed, false)
    // Loggen omtaler ikke Flash-Lite som reserve.
    assert.ok(!logs.some((e) => e.role === 'fallback' || e.role === 'primary'))
    assert.ok(logs.some((e) => e.role === 'direct' && e.model === FLASH_LITE && e.outcome === 'ok'))
    assert.ok(logs.every((e) => e.fallbackUsed === undefined || e.fallbackUsed === false))
    // Grensesnittet for oppgavegenerering viser ingen «Vi prøver en reservemodell» eller reservemelding.
    for (const file of ['src/features/tasks/AiTaskGenerator.tsx', 'src/features/tasks/AiReviseForm.tsx', 'src/features/repetition/RepetitionPlanner.tsx', 'src/features/tasks/AddTasksDialog.tsx']) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      assert.ok(!/SLOW_AI_HINT|fallbackNotice|useSlowAiHint|reservemodell/i.test(source), file)
    }
  })

  it('Flash-Lite utilgjengelig gir en kort melding – ingen annen modell prøves', async () => {
    const called: string[] = []
    const generate = createGenerate({
      callModel: async (params) => {
        called.push(params.model)
        throw new ApiError({ message: 'status 503', status: 503 })
      },
      timeoutMs: { primary: 50, fallback: 50 },
      log: () => {},
    })
    const handler = createTaskHandler({ generate, log: () => {} })
    await assert.rejects(handler(generalRequest(), teacher), (e) => e instanceof HttpError && e.status === 503 && e.message === UNAVAILABLE_MESSAGE)
    assert.deepEqual(called, [FLASH_LITE])
  })

  it('elevforslag (uendret) prøver fortsatt Gemini 3.8 Flash først og har Flash-Lite som reserve', async () => {
    const text = JSON.stringify({ melding: '', oppgaver: [{ nivaa: 1, format: 'tekst', oppgavetekst: 'Hvor mye er 3 · 4?', fasit: '12', kompetansemaal: '', tilpasning: '' }] })
    const { handler, called } = realFlow([text], { primary: 30, fallback: 1_000 })
    const result = await handler(
      { kind: 'individual', classId: '4A', context: { subject: 'Matematikk', grade: '4. trinn' }, student: { anonId: 'elev-1', level: 1, firstTryPercent: 60, strong: [], support: [], mastery: [], observations: [] }, count: 1, wishes: '' },
      teacher,
    )
    assert.deepEqual(called, [FLASH, FLASH_LITE])
    assert.equal(result.meta?.fallbackUsed, true)
  })
})

describe('13. kvalitetskontroll og utfylling fungerer med den direkte modellen', () => {
  it('en avvist kandidat erstattes i utfyllingen, og læreren får nøyaktig det bestilte antallet', async () => {
    // Nivå 2 har bare to kandidater, og den ene er en dobbel – utfyllingen gir den som mangler.
    const first = [fact(1, 3, 7), fact(1, 4, 7), fact(2, 6, 8), fact(2, 6, 8), fact(3, 6, 9), fact(3, 8, 7)]
    const refill = [fact(2, 9, 3)]
    const { handler, called, logs } = realFlow([json(first), json(refill)])
    const result = await handler(generalRequest(), teacher)
    assert.deepEqual(called, [FLASH_LITE, FLASH_LITE])
    assert.deepEqual([1, 2, 3].map((l) => result.tasks.filter((t) => t.level === l).length), [2, 2, 2])
    const final = logs.find((e) => e.event === 'general_tasks')!
    assert.equal(final.refillAttempts, 1)
    assert.equal(final.delivered, true)
    assert.ok(Object.keys(final).some((k) => k.startsWith('removed_')))
  })

  it('mangler det fortsatt oppgaver etter utfyllingene, får læreren ingen', async () => {
    const { handler, called } = realFlow([json([fact(1, 3, 7)])])
    const result = await handler(generalRequest(), teacher)
    assert.equal(called.length, 1 + aiConfig.taskGeneration.maxRefillAttempts)
    assert.ok(called.every((m) => m === FLASH_LITE))
    assert.equal(result.tasks.length, 0)
    assert.equal(result.incomplete, true)
  })
})
