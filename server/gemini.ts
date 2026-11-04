import { readFileSync } from 'node:fs'
import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel, type Content, type Schema } from '@google/genai'
import { aiConfig, type AiUse, type ThinkingLevelName } from '../src/ai/config.ts'
import { HttpError } from './errors.ts'

// Alle kall til Gemini går herfra. Systemprompten sendes som systemInstruction.

const systemPrompt = readFileSync(new URL('../src/ai/systemPrompt.md', import.meta.url), 'utf8')

const thinkingLevels: Record<ThinkingLevelName, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
}

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

/** Sender samtalen til Gemini. Med `schema` svarer modellen med JSON etter skjemaet. */
export async function generate(use: AiUse, contents: Content[], schema?: Schema) {
  // Siste tur må være fra læreren – en forhåndsutfylt modell-tur (prefill) gir feil.
  if (contents[contents.length - 1]?.role !== 'user') {
    throw new HttpError(400, 'Samtalen må slutte med en melding fra læreren.')
  }

  try {
    const response = await getClient().models.generateContent({
      model: aiConfig.model,
      contents,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: aiConfig.maxOutputTokens[use],
        thinkingConfig: { thinkingLevel: thinkingLevels[aiConfig.thinkingLevel[use]] },
        ...(schema && { responseMimeType: 'application/json', responseSchema: schema }),
      },
    })

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
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (error instanceof ApiError) {
      console.error(`Gemini API-feil ${error.status}:`, error.message)
      if (error.status === 429) {
        throw new HttpError(429, 'AI-tjenesten har mange forespørsler akkurat nå. Vent litt og prøv igjen.')
      }
      throw new HttpError(502, 'AI-tjenesten svarte med en feil. Prøv igjen om litt.')
    }
    throw error
  }
}
