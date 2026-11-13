import type { Level, Session, SessionTask } from '../../types/index.ts'

// Ett lagret elevsvar: hvilken oppgave, undertema og nivå, og om svaret ble riktig. Ingen navn, ingen svartekst og
// ingen andre elevopplysninger – eleven er bare en anonym ID (innloggings-ID-en), som trengs for å telle hvor mange
// ulike elever et resultat bygger på. Alt som vises læreren og sendes til AI-en, regnes ut fra disse og er samlet
// per nivå og undertema (se analysis.ts).

export interface AnswerRecord {
  /** Anonym elev-ID (innloggings-ID). Brukes bare til å telle ulike elever – aldri vist eller sendt til AI-en. */
  studentId: string
  sessionId: string
  /** Perioden/temaet økta hører til i årsplanen (Session.topicId), f.eks. «divisjon». */
  topicId: string
  /** Undertemaet oppgaven øver på (ferdighets-ID, f.eks. «div.rest»). */
  skill: string
  level: Level
  /** Oppgavetypen, f.eks. «Hoderegning», «Tekstoppgave» eller «Klokke». */
  taskType: string
  correct: boolean
  /** Antall forsøk eleven brukte (1 = riktig på første forsøk). */
  attempts: number
  /** Millisekunder siden 1970. */
  at: number
}

/**
 * Undertemaet en oppgave i økta øver på. Grunnoppgavene har ID-en «{økt}-n{nivå}-{nr}» og går på omgang mellom
 * undertemaene i økta; andre oppgaver (arbeidsark, AI, lærerens egne) regnes til øktas første undertema.
 */
export function skillOfTask(session: Pick<Session, 'id' | 'skillIds'>, task: Pick<SessionTask, 'id'>): string | null {
  const skills = session.skillIds ?? []
  if (skills.length <= 1) return skills[0] ?? null
  const base = new RegExp(`^${session.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-n[123]-(\\d+)$`).exec(task.id)
  return base ? skills[(Number(base[1]) - 1) % skills.length] : skills[0]
}

const FIGURE_TYPES: Record<string, string> = {
  clock: 'Klokke',
  grid: 'Rutefigur',
  shape: 'Figur',
  angle: 'Vinkel',
  dots: 'Figurtall',
  colors: 'Fargemønster',
}

/** Oppgavetypen i analysen: regnestykkets type, eller tekstoppgave (med figurtypen når oppgaven har figur). */
export function taskTypeOf(task: SessionTask): string {
  if (task.kind !== 'text') return task.type
  return task.figure ? (FIGURE_TYPES[task.figure.kind] ?? 'Tekstoppgave med figur') : 'Tekstoppgave'
}

/** Svaret som lagres når en oppgave er ferdig rettet – eller null når oppgaven ikke hører til et undertema. */
export function answerRecord(
  studentId: string,
  session: Pick<Session, 'id' | 'skillIds' | 'topicId'>,
  task: SessionTask,
  result: { correct: boolean; attempts: number },
  at = Date.now(),
): AnswerRecord | null {
  const skill = skillOfTask(session, task)
  if (!skill || !studentId) return null
  return {
    studentId,
    sessionId: session.id,
    topicId: session.topicId,
    skill,
    level: task.level,
    taskType: taskTypeOf(task),
    correct: result.correct,
    attempts: result.attempts,
    at,
  }
}
