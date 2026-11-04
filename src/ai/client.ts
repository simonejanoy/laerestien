import type { TextTask } from '../types'
import { auth } from '../lib/firebase'
import {
  isTaskResult,
  type AiTaskDraft,
  type ChatContent,
  type ChatResponse,
  type ProfileRequest,
  type TaskRequest,
  type TaskResult,
  type TextResponse,
} from './contract'

// Kall fra appen til AI-assistenten. Alt går via API-serveren (/api/ai/…), som har
// Gemini-nøkkelen. AI-en kan ikke lagre noe – det gjør appen når læreren velger det.

/** Feil med en melding som kan vises til læreren. Tekniske detaljer logges i konsollen. */
export class AiError extends Error {}

async function post(path: string, body: unknown): Promise<unknown> {
  const user = auth.currentUser
  if (!user) throw new AiError('Du må være logget inn for å bruke AI-assistenten.')

  let response: Response
  try {
    response = await fetch(`/api/ai/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(body),
    })
  } catch (error) {
    console.error(`AI-kall til /api/ai/${path} nådde ikke fram:`, error)
    throw new AiError('Fikk ikke kontakt med AI-assistenten. Sjekk nettet og prøv igjen.')
  }

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    console.error(`AI-kall til /api/ai/${path} feilet (${response.status}):`, data)
    const message = (data as { error?: unknown } | null)?.error
    // Uten JSON-feilmelding kom svaret fra Vite, ikke API-serveren – da kjører den som regel ikke.
    if (typeof message !== 'string') {
      console.error('API-serveren for AI svarer ikke. Start den med «npm run dev:api» i et eget terminalvindu.')
      throw new AiError('Får ikke kontakt med AI-serveren. Den er kanskje ikke startet – prøv igjen om litt.')
    }
    throw new AiError(message)
  }
  return data
}

export async function requestTasks(request: TaskRequest): Promise<TaskResult> {
  const data = await post('oppgaver', request)
  if (!isTaskResult(data)) {
    console.error('Ugyldig oppgavesvar fra API-serveren:', data)
    throw new AiError('AI-svaret hadde feil format og kan ikke vises. Prøv igjen.')
  }
  return data
}

export async function requestProfile(request: ProfileRequest): Promise<string> {
  const data = (await post('profil', request)) as Partial<TextResponse>
  if (typeof data.text !== 'string') throw new AiError('AI-svaret hadde feil format. Prøv igjen.')
  return data.text
}

export async function sendChat(history: ChatContent[]): Promise<ChatResponse> {
  const data = (await post('chat', { history })) as Partial<ChatResponse>
  if (typeof data.text !== 'string' || !data.content) {
    console.error('Ugyldig chatsvar fra API-serveren:', data)
    throw new AiError('AI-svaret hadde feil format. Prøv igjen.')
  }
  return data as ChatResponse
}

/** AI-oppgave → fritekstoppgave i appen. Alltid «ikke gjennomgått» til læreren sier noe annet. */
export function toTextTask(draft: AiTaskDraft, id: string): TextTask {
  return {
    kind: 'text',
    id,
    level: draft.level,
    text: draft.studentText,
    solution: draft.solution,
    competenceGoal: draft.competenceGoal,
    adaptation: draft.adaptation,
    aiGenerated: true,
    reviewed: false,
  }
}

export function toDraft(task: TextTask): AiTaskDraft {
  return {
    level: task.level,
    studentText: task.text,
    solution: task.solution,
    competenceGoal: task.competenceGoal,
    adaptation: task.adaptation,
  }
}

let counter = 0
/** Unik id for nye AI-oppgaver. */
export const newTaskId = (prefix: string) => `${prefix}-ai-${Date.now()}-${counter++}`

/** Fag og trinn for klassen (4A er 4. trinn). */
export const subjectContext = (className = '4A') => ({ subject: 'Matematikk', grade: `${parseInt(className)}. trinn` })
