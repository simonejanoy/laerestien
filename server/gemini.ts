import { readFileSync } from 'node:fs'
import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Schema,
} from '@google/genai'
import { aiConfig, timeoutsFor, type AiUse, type ThinkingLevelName } from '../src/ai/config.ts'
import { HttpError } from './errors.ts'

// Alle kall til Gemini går herfra. Systemprompten sendes som systemInstruction.
// Primærmodellen prøves én gang. Når den når tidsgrensen eller svarer 500/503/504,
// prøves reservemodellen én gang med nøyaktig samme forespørsel.

const systemPrompt = readFileSync(new URL('../src/ai/systemPrompt.md', import.meta.url), 'utf8')

const thinkingLevels: Record<ThinkingLevelName, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
}

/** Meldingen læreren får når verken primær- eller reservemodellen svarte. */
export const UNAVAILABLE_MESSAGE = 'AI-tjenesten er midlertidig utilgjengelig. Prøv igjen om litt.'

/** Statuskoder som betyr at modellen er midlertidig utilgjengelig – da prøves reservemodellen. */
const FALLBACK_STATUSES = new Set([500, 503, 504])

/** Ett kall til én modell. Byttes ut i testene, så de ikke kaller Gemini. */
export type ModelCaller = (params: GenerateContentParameters) => Promise<GenerateContentResponse>

/** Logglinje med bare tekniske data – aldri lærerens melding, elevopplysninger, systemprompt eller nøkkel. */
export type AiLogEntry = Record<string, string | number | boolean>
export type AiLog = (entry: AiLogEntry) => void

export interface GenerateResult {
  text: string
  content: Content
  /** Modellen som leverte svaret. */
  model: string
  fallbackUsed: boolean
}

export type Role = 'primary' | 'fallback'

class TimeoutError extends Error {}

let client: GoogleGenAI | undefined

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('GEMINI_API_KEY mangler. Legg den i .env (se .env.example) og start serveren på nytt.')
    throw new HttpError(503, 'AI-assistenten er ikke satt opp ennå: API-nøkkelen mangler på serveren.')
  }
  client ??= new GoogleGenAI({ apiKey })
  return client
}

const callGemini: ModelCaller = async (params) => getClient().models.generateContent(params)

/** Standardloggen: én JSON-linje per hendelse i serverloggen. */
export const logToConsole: AiLog = (entry) => console.info('[ai]', JSON.stringify(entry))

/** Avbryter kallet etter `ms` millisekunder. */
async function withTimeout(callModel: ModelCaller, params: GenerateContentParameters, ms: number) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError())
      controller.abort()
    }, ms)
  })
  const request = callModel({ ...params, config: { ...params.config, abortSignal: controller.signal } })
  request.catch(() => {}) // Avbrutt etter tidsgrensen – feilen er alt håndtert.
  try {
    return await Promise.race([request, timeout])
  } finally {
    clearTimeout(timer)
  }
}

function outcomeOf(error: unknown): AiLogEntry {
  if (error instanceof TimeoutError) return { outcome: 'timeout' }
  if (error instanceof ApiError) return { outcome: 'api_error', status: error.status }
  if (error instanceof HttpError) return { outcome: 'setup_error', status: error.status }
  return { outcome: 'error', errorType: error instanceof Error ? error.name : typeof error }
}

const shouldFallback = (error: unknown) =>
  error instanceof TimeoutError || (error instanceof ApiError && FALLBACK_STATUSES.has(error.status))

/** Feil fra primærmodellen som ikke gir fallback. */
function toHttpError(error: unknown): unknown {
  if (error instanceof HttpError) return error
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return new HttpError(429, 'AI-tjenesten har mange forespørsler akkurat nå. Vent litt og prøv igjen.')
    }
    return new HttpError(502, 'AI-tjenesten svarte med en feil. Prøv igjen om litt.')
  }
  return error
}

/** Kontrollerer svaret etter at modellen har svart. Ugyldige svar gir aldri fallback. */
function readResponse(response: GenerateContentResponse) {
  const candidate = response.candidates?.[0]
  if (candidate?.finishReason === FinishReason.MAX_TOKENS) {
    throw new HttpError(502, 'Svaret fra AI-en ble for langt og ble avbrutt. Prøv å be om færre oppgaver.')
  }
  const text = response.text
  if (!text || !candidate?.content) {
    console.error('Gemini ga ikke noe svar:', candidate?.finishReason, response.promptFeedback)
    throw new HttpError(502, 'AI-en ga ikke noe svar på denne forespørselen. Prøv å formulere den på en annen måte.')
  }
  return { text, content: candidate.content }
}

interface GenerateOptions {
  callModel?: ModelCaller
  /** Samme grenser for all bruk, eller grenser per bruk. Standard: aiConfig (timeoutsFor). */
  timeoutMs?: Record<Role, number> | ((use: AiUse) => Record<Role, number>)
  log?: AiLog
}

/**
 * Valg for ett kall. `startWith: 'fallback'` går rett til reservemodellen – brukes når en utfylling
 * skal gjenbruke modellen som svarte, og primærmodellen nettopp fikk timeout.
 */
export interface CallOptions {
  startWith?: Role
}

/** Lager `generate`. Testene sender inn egen modellfunksjon, korte tidsgrenser og egen logg. */
export function createGenerate({ callModel = callGemini, timeoutMs = timeoutsFor, log = logToConsole }: GenerateOptions = {}) {
  const limitsFor = (use: AiUse) => (typeof timeoutMs === 'function' ? timeoutMs(use) : timeoutMs)
  /**
   * Sender samtalen til Gemini. Med `schema` svarer modellen med JSON etter skjemaet.
   * `trace` (f.eks. requestId) tas med i hver logglinje – bare tekniske data.
   */
  return async function generate(
    use: AiUse,
    contents: Content[],
    schema?: Schema,
    trace: AiLogEntry = {},
    { startWith = 'primary' }: CallOptions = {},
  ): Promise<GenerateResult> {
    // Siste tur må være fra læreren – en forhåndsutfylt modell-tur (prefill) gir feil.
    if (contents[contents.length - 1]?.role !== 'user') {
      throw new HttpError(400, 'Samtalen må slutte med en melding fra læreren.')
    }

    // Samme innstillinger for begge modellene.
    const config: GenerateContentParameters['config'] = {
      systemInstruction: systemPrompt,
      maxOutputTokens: aiConfig.maxOutputTokens[use],
      thinkingConfig: { thinkingLevel: thinkingLevels[aiConfig.thinkingLevel[use]] },
      // Ingen skjulte nye forsøk i SDK-et – ventetiden styres av tidsgrensene her.
      httpOptions: { retryOptions: { attempts: 1 } },
      ...(schema && { responseMimeType: 'application/json', responseSchema: schema }),
    }

    const { rulesVersion } = aiConfig
    const limits = limitsFor(use)
    const attempt = async (model: string, role: Role) => {
      const started = Date.now()
      try {
        const response = await withTimeout(callModel, { model, contents, config }, limits[role])
        log({ ...trace, use, rulesVersion, model, role, outcome: 'ok', timeoutMs: limits[role], durationMs: Date.now() - started })
        return response
      } catch (error) {
        log({ ...trace, use, rulesVersion, model, role, ...outcomeOf(error), timeoutMs: limits[role], durationMs: Date.now() - started })
        throw error
      }
    }

    let model = aiConfig.fallbackModel
    let fallbackUsed = true
    let response: GenerateContentResponse
    const tryFallback = async () => {
      try {
        return await attempt(aiConfig.fallbackModel, 'fallback')
      } catch {
        log({ ...trace, use, rulesVersion, outcome: 'unavailable', fallbackUsed })
        throw new HttpError(503, UNAVAILABLE_MESSAGE)
      }
    }
    if (startWith === 'fallback') {
      // Bare reservemodellen – primærmodellen prøves ikke igjen.
      response = await tryFallback()
    } else {
      try {
        response = await attempt(aiConfig.primaryModel, 'primary')
        model = aiConfig.primaryModel
        fallbackUsed = false
      } catch (error) {
        if (!shouldFallback(error)) throw toHttpError(error)
        response = await tryFallback()
      }
    }

    log({ ...trace, use, rulesVersion, outcome: 'answered', servedBy: model, fallbackUsed })
    return { ...readResponse(response), model, fallbackUsed }
  }
}

export const generate = createGenerate()
