import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Content } from '@google/genai'
import {
  parseTaskResult,
  type ChatRequest,
  type ChatResponse,
  type ProfileRequest,
  type TaskRequest,
  type TaskResult,
  type TextResponse,
} from '../src/ai/contract.ts'
import { requireOwnClass, requireTeacher, type Teacher } from './auth.ts'
import { HttpError } from './errors.ts'
import { generate } from './gemini.ts'
import { profilePrompt, taskPrompt } from './prompts.ts'
import { taskSchema } from './taskSchema.ts'

// API-serveren for AI-assistenten. Nettleseren snakker bare med denne – aldri direkte
// med Gemini – så API-nøkkelen holdes på serveren.
// Start: npm run dev:api (leser .env og .env.local).

const PORT = Number(process.env.AI_SERVER_PORT ?? 8787)
const MAX_BODY_BYTES = 200_000

const userTurn = (text: string): Content => ({ role: 'user', parts: [{ text }] })

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

async function tasks(body: unknown, teacher: Teacher): Promise<TaskResult> {
  if (!isObject(body) || !['general', 'individual', 'revise'].includes(body.kind as string)) {
    throw new HttpError(400, 'Ukjent type oppgavebestilling.')
  }
  const request = body as unknown as TaskRequest
  if (request.kind === 'individual' || (request.kind === 'revise' && request.student)) {
    requireOwnClass(teacher, request.classId)
  }

  const { text } = await generate('tasks', [userTurn(taskPrompt(request))], taskSchema)

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    console.error('Gemini returnerte ugyldig JSON:', text.slice(0, 500))
    throw new HttpError(502, 'AI-svaret hadde feil format og kan ikke vises. Prøv igjen.')
  }
  const result = parseTaskResult(raw)
  if (!result) {
    console.error('Gemini-svaret fulgte ikke skjemaet:', text.slice(0, 500))
    throw new HttpError(502, 'AI-svaret hadde feil format og kan ikke vises. Prøv igjen.')
  }
  if (result.tasks.length === 0 && !result.message) {
    throw new HttpError(502, 'AI-en laget ingen brukbare oppgaver. Prøv igjen.')
  }
  return result
}

async function profile(body: unknown, teacher: Teacher): Promise<TextResponse> {
  if (!isObject(body) || !isObject(body.student)) throw new HttpError(400, 'Elevopplysningene mangler.')
  const request = body as unknown as ProfileRequest
  requireOwnClass(teacher, request.classId)
  const { text } = await generate('profile', [userTurn(profilePrompt(request))])
  return { text }
}

async function chat(body: unknown): Promise<ChatResponse> {
  const history = isObject(body) ? (body as unknown as ChatRequest).history : undefined
  const valid =
    Array.isArray(history) &&
    history.length > 0 &&
    history.every((c) => isObject(c) && (c.role === 'user' || c.role === 'model') && Array.isArray(c.parts))
  if (!valid) throw new HttpError(400, 'Samtalen hadde feil format.')

  // Historikken sendes uendret, så thought signatures i modellens tidligere turer blir med.
  const { text, content } = await generate('chat', history as Content[])
  return { text, content: content as ChatResponse['content'] }
}

const routes: Record<string, (body: unknown, teacher: Teacher) => Promise<unknown>> = {
  '/api/ai/oppgaver': tasks,
  '/api/ai/profil': profile,
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
