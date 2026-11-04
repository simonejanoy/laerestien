// Det appen og API-serveren sender til hverandre. Brukes begge steder, så filen
// skal ikke importere noe (serveren kjører TypeScript direkte i Node).

export type AiLevel = 1 | 2 | 3

/** Én oppgave fra AI-en, slik appen bruker den. */
export interface AiTaskDraft {
  level: AiLevel
  /** Oppgavetekst til eleven. */
  studentText: string
  /** Fasit eller løsningsforslag til læreren. */
  solution: string
  /** Kompetansemål – bare hvis læreren har oppgitt det, ellers tomt. */
  competenceGoal: string
  /** Kort forklaring på tilpasningen. */
  adaptation: string
}

export interface TaskResult {
  tasks: AiTaskDraft[]
  /** Kort beskjed fra AI-en til læreren (f.eks. om noe i bestillingen ikke kunne følges). */
  message: string
}

/** Fag og trinn – alltid med, så AI-en ikke må spørre. */
export interface SubjectContext {
  subject: string
  grade: string
}

export interface LessonContext extends SubjectContext {
  topic: string
  sessionHeading: string
  sessionDescription: string
  /** Lærerens egne mål for økta (ikke offisiell måltekst). */
  sessionGoals: string[]
}

/**
 * Det AI-en får vite om en elev: anonym ID og resultater fra appen – ikke navn, bilde
 * eller andre personopplysninger.
 */
export interface AnonStudentProfile {
  anonId: string
  /** Nivået læreren har satt i appen. */
  level: AiLevel
  firstTryPercent: number
  strong: string[]
  support: string[]
  mastery: { topic: string; status: string; note?: string }[]
  /** Observasjoner fra appen, uten navn. */
  observations: string[]
}

export type TaskRequest =
  | {
      kind: 'general'
      lesson: LessonContext
      perLevel: number
      /** Offisiell måltekst, limt inn ordrett av læreren (kan være tom). */
      officialGoals: string
      wishes: string
    }
  | {
      kind: 'individual'
      /** Klassen eleven går i – må være lærerens egen. */
      classId: string
      context: SubjectContext
      student: AnonStudentProfile
      count: number
      wishes: string
    }
  | {
      kind: 'revise'
      context: SubjectContext & { topic: string }
      task: AiTaskDraft
      instruction: string
      /** Med når oppgaven er tilpasset en elev. */
      classId?: string
      student?: AnonStudentProfile
    }

export interface ProfileRequest {
  classId: string
  context: SubjectContext
  student: AnonStudentProfile
  /** Lærerens egne observasjoner (valgfritt). */
  teacherNotes: string
}

/** Én tur i samtalen. Sendes tilbake uendret, så thought signatures blir med. */
export interface ChatContent {
  role: 'user' | 'model'
  parts: Record<string, unknown>[]
}

export interface ChatRequest {
  history: ChatContent[]
}

export interface ChatResponse {
  text: string
  /** Modellens tur, slik den kom fra API-et – legges uendret til i historikken. */
  content: ChatContent
}

export interface TextResponse {
  text: string
}

/** Feltnavnene i JSON-skjemaet (se server/taskSchema.ts). */
interface RawTask {
  nivaa?: unknown
  oppgavetekst?: unknown
  fasit?: unknown
  kompetansemaal?: unknown
  tilpasning?: unknown
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/**
 * Sjekker et oppgavesvar fra AI-en. Ugyldige oppgaver fjernes. Returnerer null hvis
 * svaret ikke har riktig form i det hele tatt.
 */
export function parseTaskResult(raw: unknown): TaskResult | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { oppgaver, melding } = raw as { oppgaver?: unknown; melding?: unknown }
  if (!Array.isArray(oppgaver)) return null

  const tasks = oppgaver.flatMap((item: RawTask): AiTaskDraft[] => {
    if (typeof item !== 'object' || item === null) return []
    const level = Number(item.nivaa)
    const studentText = text(item.oppgavetekst)
    const solution = text(item.fasit)
    if (![1, 2, 3].includes(level) || !studentText || !solution) return []
    return [
      {
        level: level as AiLevel,
        studentText,
        solution,
        competenceGoal: text(item.kompetansemaal),
        adaptation: text(item.tilpasning),
      },
    ]
  })
  return { tasks, message: text(melding) }
}

/** Det samme som parseTaskResult, men for svar som allerede er gjort om (fra API-serveren til appen). */
export function isTaskResult(value: unknown): value is TaskResult {
  if (typeof value !== 'object' || value === null) return false
  const { tasks, message } = value as Partial<TaskResult>
  return (
    typeof message === 'string' &&
    Array.isArray(tasks) &&
    tasks.every(
      (t) =>
        [1, 2, 3].includes(t?.level) &&
        typeof t.studentText === 'string' &&
        t.studentText.length > 0 &&
        typeof t.solution === 'string' &&
        t.solution.length > 0 &&
        typeof t.competenceGoal === 'string' &&
        typeof t.adaptation === 'string',
    )
  )
}
