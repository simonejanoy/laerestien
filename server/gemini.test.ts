// Tester for fallback i generate(). Ingen ekte Gemini-kall: modellen erstattes av en
// kontrollert testfunksjon, og tidsgrensene er korte. Kjør: npm test

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it, mock } from 'node:test'
import { ApiError, GenerateContentResponse, ThinkingLevel, type Content, type GenerateContentParameters } from '@google/genai'
import { aiConfig } from '../src/ai/config.ts'
import { HttpError } from './errors.ts'
import { UNAVAILABLE_MESSAGE, createGenerate, type AiLogEntry, type ModelCaller } from './gemini.ts'

const PRIMARY = aiConfig.primaryModel
const FALLBACK = aiConfig.fallbackModel
const timeoutMs = { primary: 40, fallback: 80 }

/** Lærermelding med «personopplysninger» som aldri skal havne i loggen. */
const SECRET = 'HEMMELIG-ELEV-Kari-Nordmann-12345'
const contents: Content[] = [{ role: 'user', parts: [{ text: `Lag oppgaver til ${SECRET}` }] }]

function answer(text: string) {
  return Object.assign(new GenerateContentResponse(), {
    candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
  })
}

type Behaviour = 'ok' | 'hang' | number

/** Testmodell: svarer, henger (til den avbrytes) eller feiler med gitt HTTP-status – per modell. */
function fakeModels(behaviour: Record<string, Behaviour>) {
  const calls: GenerateContentParameters[] = []
  const callModel: ModelCaller = async (params) => {
    calls.push(params)
    const what = behaviour[params.model]
    if (what === 'ok') return answer(`svar fra ${params.model}`)
    if (what === 'hang') {
      return new Promise((_, reject) =>
        params.config?.abortSignal?.addEventListener('abort', () => reject(new Error('aborted'))),
      )
    }
    throw new ApiError({ message: `status ${what}`, status: what ?? 500 })
  }
  return { calls, callModel, models: () => calls.map((c) => c.model) }
}

function setup(behaviour: Record<string, Behaviour>) {
  const fake = fakeModels(behaviour)
  const logs: AiLogEntry[] = []
  const generate = createGenerate({ callModel: fake.callModel, timeoutMs, log: (e) => logs.push(e) })
  return { ...fake, logs, generate }
}

afterEach(() => mock.restoreAll())

describe('generate med fallback', () => {
  it('1. primærmodellen svarer – reservemodellen kalles ikke', async () => {
    const { generate, models } = setup({ [PRIMARY]: 'ok', [FALLBACK]: 'ok' })
    const result = await generate('tasks', contents)
    assert.equal(result.text, `svar fra ${PRIMARY}`)
    assert.deepEqual(models(), [PRIMARY])
  })

  it('2. primærmodellen gir 503 – reservemodellen svarer', async () => {
    const { generate, models } = setup({ [PRIMARY]: 503, [FALLBACK]: 'ok' })
    const result = await generate('profile', contents)
    assert.equal(result.text, `svar fra ${FALLBACK}`)
    assert.deepEqual(models(), [PRIMARY, FALLBACK])
  })

  for (const status of [500, 504]) {
    it(`primærmodellen gir ${status} – reservemodellen svarer`, async () => {
      const { generate, models } = setup({ [PRIMARY]: status, [FALLBACK]: 'ok' })
      await generate('chat', contents)
      assert.deepEqual(models(), [PRIMARY, FALLBACK])
    })
  }

  it('3. primærmodellen når tidsgrensen – kallet avbrytes og reservemodellen svarer', async () => {
    const { generate, calls, models, logs } = setup({ [PRIMARY]: 'hang', [FALLBACK]: 'ok' })
    const result = await generate('tasks', contents)
    assert.equal(result.text, `svar fra ${FALLBACK}`)
    assert.deepEqual(models(), [PRIMARY, FALLBACK])
    assert.equal(calls[0]?.config?.abortSignal?.aborted, true)
    assert.ok(logs.some((e) => e.role === 'primary' && e.outcome === 'timeout'))
  })

  it('4. primærmodellen gir 400 – reservemodellen kalles ikke', async () => {
    const { generate, models } = setup({ [PRIMARY]: 400, [FALLBACK]: 'ok' })
    await assert.rejects(generate('tasks', contents), (e) => e instanceof HttpError && e.status === 502)
    assert.deepEqual(models(), [PRIMARY])
  })

  for (const status of [401, 403]) {
    it(`primærmodellen gir ${status} – reservemodellen kalles ikke`, async () => {
      const { generate, models } = setup({ [PRIMARY]: status, [FALLBACK]: 'ok' })
      await assert.rejects(generate('tasks', contents), HttpError)
      assert.deepEqual(models(), [PRIMARY])
    })
  }

  it('5. primærmodellen gir 429 – reservemodellen kalles ikke', async () => {
    const { generate, models } = setup({ [PRIMARY]: 429, [FALLBACK]: 'ok' })
    await assert.rejects(generate('tasks', contents), (e) => e instanceof HttpError && e.status === 429)
    assert.deepEqual(models(), [PRIMARY])
  })

  it('ugyldig svar fra primærmodellen gir ikke fallback', async () => {
    const callModel: ModelCaller = async (params) => {
      if (params.model === PRIMARY) return Object.assign(new GenerateContentResponse(), { candidates: [] })
      return answer('skal ikke brukes')
    }
    const models: string[] = []
    const generate = createGenerate({
      callModel: (p) => (models.push(p.model), callModel(p)),
      timeoutMs,
      log: () => {},
    })
    mock.method(console, 'error', () => {})
    await assert.rejects(generate('tasks', contents), (e) => e instanceof HttpError && e.status === 502)
    assert.deepEqual(models, [PRIMARY])
  })

  it('6. begge modellene feiler – læreren får en kort melding', async () => {
    for (const fallback of [503, 'hang', 429] as const) {
      const { generate, models } = setup({ [PRIMARY]: 503, [FALLBACK]: fallback })
      await assert.rejects(
        generate('tasks', contents),
        (e) => e instanceof HttpError && e.status === 503 && e.message === UNAVAILABLE_MESSAGE,
      )
      assert.deepEqual(models(), [PRIMARY, FALLBACK])
    }
  })

  it('samlet ventetid er begrenset av de to tidsgrensene', async () => {
    const { generate } = setup({ [PRIMARY]: 'hang', [FALLBACK]: 'hang' })
    const started = Date.now()
    await assert.rejects(generate('tasks', contents), (e) => e instanceof HttpError && e.message === UNAVAILABLE_MESSAGE)
    const elapsed = Date.now() - started
    assert.ok(elapsed >= timeoutMs.primary + timeoutMs.fallback - 5, `for kort: ${elapsed}`)
    assert.ok(elapsed < timeoutMs.primary + timeoutMs.fallback + 150, `for lang: ${elapsed}`)
  })

  it('7. metadata viser riktig modell og om fallback ble brukt', async () => {
    const primary = await setup({ [PRIMARY]: 'ok', [FALLBACK]: 'ok' }).generate('tasks', contents)
    assert.equal(primary.model, PRIMARY)
    assert.equal(primary.fallbackUsed, false)

    const fallback = await setup({ [PRIMARY]: 503, [FALLBACK]: 'ok' }).generate('tasks', contents)
    assert.equal(fallback.model, FALLBACK)
    assert.equal(fallback.fallbackUsed, true)
  })

  it('reservemodellen får samme innhold, systemprompt, skjema, thinking level og tokengrense', async () => {
    const schema = { type: 'OBJECT' } as const
    const { generate, calls } = setup({ [PRIMARY]: 503, [FALLBACK]: 'ok' })
    await generate('profile', contents, schema as never)
    const [first, second] = calls.map(({ config, ...rest }) => {
      const { abortSignal: _ignored, ...sameConfig } = config ?? {}
      void _ignored
      return { ...rest, model: undefined, config: sameConfig }
    })
    assert.deepEqual(second, first)
    assert.equal(calls[1]?.config?.maxOutputTokens, aiConfig.maxOutputTokens.profile)
    assert.equal(calls[1]?.config?.thinkingConfig?.thinkingLevel, ThinkingLevel.HIGH)
    assert.equal(calls[1]?.config?.responseSchema, schema)
    assert.equal(calls[1]?.config?.httpOptions?.retryOptions?.attempts, 1)
  })

  it('8. loggen har regelversjon, men ikke forespørselsinnhold, personopplysninger, systemprompt eller nøkkel', async () => {
    const apiKey = 'TEST-NOKKEL-abcdef'
    process.env.GEMINI_API_KEY = apiKey
    const output: string[] = []
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      mock.method(console, method, (...args: unknown[]) => output.push(args.map(String).join(' ')))
    }
    // Standardloggen (console) brukes her, så vi tester det som faktisk skrives på serveren.
    for (const behaviour of [
      { [PRIMARY]: 'ok', [FALLBACK]: 'ok' },
      { [PRIMARY]: 503, [FALLBACK]: 'ok' },
      { [PRIMARY]: 'hang', [FALLBACK]: 503 },
      { [PRIMARY]: 400, [FALLBACK]: 'ok' },
    ] as Record<string, Behaviour>[]) {
      const generate = createGenerate({ callModel: fakeModels(behaviour).callModel, timeoutMs })
      await generate('chat', contents).catch(() => {})
    }
    delete process.env.GEMINI_API_KEY

    const log = output.join('\n')
    assert.ok(log.includes(PRIMARY) && log.includes(FALLBACK), 'loggen skal vise modellene')
    assert.ok(log.includes('"use":"chat"') && log.includes('durationMs') && log.includes('"status":503'))
    assert.ok(log.includes('"outcome":"timeout"') && log.includes('"fallbackUsed":true'))
    assert.ok(log.includes(`"rulesVersion":"${aiConfig.rulesVersion}"`), 'regelversjonen skal stå i loggen')
    assert.ok(!log.includes(SECRET), 'lærerens melding / elevdata i loggen')
    assert.ok(!log.includes('Lag oppgaver til'), 'forespørselsinnhold i loggen')
    assert.ok(!log.includes(apiKey), 'API-nøkkelen i loggen')
    const systemPrompt = readFileSync(new URL('../src/ai/systemPrompt.md', import.meta.url), 'utf8')
    const promptLines = systemPrompt.split('\n').filter((line) => line.trim().length > 20)
    assert.ok(promptLines.length > 0)
    assert.ok(!promptLines.some((line) => log.includes(line.trim())), 'systemprompten i loggen')
  })
})
