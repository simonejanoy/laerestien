import { auth } from '../lib/firebase'
import {
  isTaskResult,
  readMeta,
  type AiResponseMeta,
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
  const warning = (data as { warning?: unknown }).warning
  const incomplete = (data as { incomplete?: unknown }).incomplete === true
  return {
    tasks: data.tasks,
    message: data.message,
    warning: typeof warning === 'string' ? warning : undefined,
    ...(incomplete && { incomplete }),
    meta: readMeta(data),
  }
}

export async function requestProfile(request: ProfileRequest): Promise<TextResponse> {
  const data = (await post('profil', request)) as Partial<TextResponse>
  if (typeof data.text !== 'string') throw new AiError('AI-svaret hadde feil format. Prøv igjen.')
  return { text: data.text, meta: readMeta(data) }
}

export async function sendChat(history: ChatContent[]): Promise<ChatResponse> {
  const data = (await post('chat', { history })) as Partial<ChatResponse>
  if (typeof data.text !== 'string' || !data.content) {
    console.error('Ugyldig chatsvar fra API-serveren:', data)
    throw new AiError('AI-svaret hadde feil format. Prøv igjen.')
  }
  return { text: data.text, content: data.content, meta: readMeta(data) }
}

/** Vises mens læreren venter, når hovedmodellen har brukt opp tidsgrensen sin. Ikke en feil. */
export const SLOW_AI_HINT = 'Dette tar litt lengre tid. Vi prøver en reservemodell.'

/**
 * Diskret beskjed når svaret kom fra reservemodellen, f.eks. «Oppgavene ble laget …».
 * Gir null når hovedmodellen svarte (eller metadata mangler).
 */
export function fallbackNotice(meta: AiResponseMeta | undefined, what: string): string | null {
  return meta?.fallbackUsed ? `${what} ble laget med reservemodellen fordi hovedmodellen var midlertidig utilgjengelig.` : null
}

export { applyRevision, toDraft, toSessionTask, toTextTask } from './drafts'

let counter = 0
/** Unik id for nye AI-oppgaver. */
export const newTaskId = (prefix: string) => `${prefix}-ai-${Date.now()}-${counter++}`

/** Fag og trinn for klassen (4A er 4. trinn). */
export const subjectContext = (className = '4A') => ({ subject: 'Matematikk', grade: `${parseInt(className)}. trinn` })
