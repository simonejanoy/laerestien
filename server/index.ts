import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Content } from '@google/genai'
import type { AiResponseMeta, ChatRequest, ChatResponse } from '../src/ai/contract.ts'
import { requireTeacher, type Teacher } from './auth.ts'
import { HttpError } from './errors.ts'
import { generate, logToConsole, type GenerateResult } from './gemini.ts'
import { createTaskHandler } from './taskHandler.ts'

// API-serveren for AI-assistenten. Nettleseren snakker bare med denne – aldri direkte
// med Gemini – så API-nøkkelen holdes på serveren.
// Start: npm run dev:api (leser .env og .env.local).

const PORT = Number(process.env.AI_SERVER_PORT ?? 8787)
const MAX_BODY_BYTES = 200_000

/** Forteller appen hvilken modell som svarte, så læreren ser om reservemodellen ble brukt. */
const metaOf = ({ model, fallbackUsed }: GenerateResult): AiResponseMeta => ({ model, fallbackUsed })

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Forespørselen er for stor.')
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Forespørselen hadde feil format.')
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Oppgavebestillinger (se taskHandler.ts). Referansebanken lastes og kontrolleres når serveren starter. */
const tasks = createTaskHandler({ generate, log: logToConsole })

async function chat(body: unknown): Promise<ChatResponse> {
  const history = isObject(body) ? (body as unknown as ChatRequest).history : undefined
  const valid =
    Array.isArray(history) &&
    history.length > 0 &&
    history.every((c) => isObject(c) && (c.role === 'user' || c.role === 'model') && Array.isArray(c.parts))
  if (!valid) throw new HttpError(400, 'Samtalen hadde feil format.')

  // Historikken sendes uendret, så thought signatures i modellens tidligere turer blir med.
  const answer = await generate('chat', history as Content[])
  return { text: answer.text, content: answer.content as ChatResponse['content'], meta: metaOf(answer) }
}

const routes: Record<string, (body: unknown, teacher: Teacher) => Promise<unknown>> = {
  '/api/ai/oppgaver': tasks,
  '/api/ai/chat': chat,
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

const server = createServer(async (req, res) => {
  const route = routes[req.url ?? '']
  if (!route) return send(res, 404, { error: 'Fant ikke denne adressen.' })
  if (req.method !== 'POST') return send(res, 405, { error: 'Bare POST er støttet.' })

  try {
    const teacher = await requireTeacher(req)
    send(res, 200, await route(await readJson(req), teacher))
  } catch (error) {
    if (error instanceof HttpError) return send(res, error.status, { error: error.message })
    console.error(`Uventet feil i ${req.url}:`, error)
    send(res, 500, { error: 'Noe gikk galt hos AI-assistenten. Prøv igjen om litt.' })
  }
})

server.listen(PORT, () => {
  console.log(`AI-serveren kjører på http://localhost:${PORT}`)
  if (!process.env.GEMINI_API_KEY) console.warn('Advarsel: GEMINI_API_KEY er ikke satt (se .env.example).')
})
