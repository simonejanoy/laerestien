import type { Level, SessionTask, Student, UserProfile } from '../../types/index.ts'
import { finalResultOf, isMathState, type TaskAnswerState } from '../student/studentTasks.ts'

// Elevenes framdrift i økta som pågår: hvilke oppgaver eleven har levert, og hva læreren ser.
// Rene funksjoner (ingen React og ingen Firebase), så de kan testes i Node. Importene har .ts-endelse.
//
// Framdriften hører til én gjennomføring av økta («run»). Hver gang læreren starter en økt, får den en ny run-ID, så
// resultater fra en tidligere gjennomføring aldri vises som framdrift i en ny. Tidligere gjennomføringer slettes ikke.

export type LiveStatus = 'running' | 'paused' | 'ended'

/** Økta i klassen (Firestore: liveSessions/{classId}). Læreren skriver, elevene lytter. */
export interface LiveSession {
  sessionId: string
  status: LiveStatus
  /** Millisekunder siden 1970. */
  startedAt: number
  /** Én ID per gang økta startes. Eldre dokumenter mangler den (se runIdOf). */
  runId?: string
  endedAt?: number
}

/**
 * Klassen økta startes for. Det er lærerens egen klasse – den samme som elevene lytter på,
 * og den eneste Firestore-reglene lar læreren skrive til.
 */
export const liveClassId = (teacherClassId: string | undefined, sessionClassName: string) => teacherClassId || sessionClassName

/** ID-en til gjennomføringen. Inneholder aldri «/», så den kan brukes i dokument-ID-er. */
export const makeRunId = (sessionId: string, startedAt: number) => `${sessionId}-${startedAt}`.replace(/\//g, '_')

export const runIdOf = (live: Pick<LiveSession, 'sessionId' | 'startedAt' | 'runId'>) => live.runId ?? makeRunId(live.sessionId, live.startedAt)

/** Ny gjennomføring av økta (det læreren skriver når hen trykker «Start økt»). */
export function newLiveSession(sessionId: string, startedAt = Date.now()): LiveSession {
  return { sessionId, status: 'running', startedAt, runId: makeRunId(sessionId, startedAt) }
}

/** Eleven kan levere svar bare mens akkurat denne gjennomføringen er i gang (ikke på pause, ikke avsluttet). */
export function canDeliver(live: LiveSession | null | undefined, runId: string | null) {
  return !!live && !!runId && live.status === 'running' && runIdOf(live) === runId
}

/**
 * Hva eleven ser: kobler til, venter på læreren (ingen økt startet, eller en økt eleven ikke har), pause, avsluttet –
 * eller oppgavene. Oppgavene vises bare mens økta er i gang.
 */
export type StudentViewState = 'connecting' | 'failed' | 'waiting' | 'paused' | 'ended' | 'tasks'

export function studentViewState(live: LiveSession | null | undefined, sessionKnown: boolean, failed = false): StudentViewState {
  if (failed) return 'failed'
  if (live === undefined) return 'connecting'
  if (!live || !sessionKnown) return 'waiting'
  if (live.status === 'paused') return 'paused'
  if (live.status === 'ended') return 'ended'
  return 'tasks'
}

/** Hvordan økta står for læreren: bare planlagt, aktiv (i gang eller på pause) eller avsluttet. */
export type SessionRunState = 'planned' | 'running' | 'paused' | 'ended'

export function runStateFor(live: LiveSession | null | undefined, sessionId: string): SessionRunState {
  if (!live || live.sessionId !== sessionId) return 'planned'
  return live.status
}

export const RUN_STATE_LABELS: Record<SessionRunState, string> = {
  planned: 'Planlagt – ikke startet',
  running: 'Økten er i gang',
  paused: 'Økten er satt på pause',
  ended: 'Økten er avsluttet',
}

// ---------------------------------------------------------------------------------------------
// Levering

/** Én levert oppgave. `correct` er null når appen ikke retter svaret selv (læreren vurderer det). */
export interface DeliveredTask {
  correct: boolean | null
  attempts: number
  at: number
}

/**
 * Elevens framdrift i én gjennomføring (Firestore: liveSessions/{classId}/progress/{runId}__{uid}). Ingen navn og
 * ingen svartekst – bare hvilke oppgaver som er levert, og om de ble riktige.
 */
export interface ProgressDoc {
  studentId: string
  runId: string
  sessionId: string
  level: Level
  /** Antall oppgaver eleven fikk i økta (på sitt nivå). */
  total: number
  delivered: Record<string, DeliveredTask>
  updatedAt: number
}

export const progressDocId = (runId: string, studentId: string) => `${runId}__${studentId}`

/**
 * Om oppgaven er levert, og i så fall resultatet. Regnestykker er levert når de er ferdig rettet (riktig, eller svaret
 * vist etter siste forsøk). Tekstoppgaver er levert når eleven har levert svaret. Å åpne eller bla forbi en oppgave er
 * ikke å levere den.
 */
export function deliveryOf(state: TaskAnswerState | undefined, at = Date.now()): DeliveredTask | null {
  if (!state) return null
  const result = finalResultOf(state)
  if (isMathState(state)) return result ? { correct: result.correct, attempts: result.attempts, at } : null
  if (!state.submitted) return null
  return result ? { correct: result.correct, attempts: result.attempts, at } : { correct: null, attempts: 1, at }
}

/** Det eleven sender når en oppgave er levert (slås sammen med det som er lagret fra før). */
export function deliveryUpdate(
  base: Pick<ProgressDoc, 'studentId' | 'runId' | 'sessionId' | 'level' | 'total'>,
  taskId: string,
  delivery: DeliveredTask,
): ProgressDoc {
  return { ...base, delivered: { [taskId]: delivery }, updatedAt: delivery.at }
}

/** Leser et framdriftsdokument felt for felt. Ugyldige data gir null. */
export function readProgressDoc(value: unknown): ProgressDoc | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.studentId !== 'string' || typeof v.runId !== 'string' || typeof v.sessionId !== 'string') return null
  if (v.level !== 1 && v.level !== 2 && v.level !== 3) return null
  if (!Number.isInteger(v.total) || (v.total as number) < 0) return null
  const delivered: Record<string, DeliveredTask> = {}
  if (typeof v.delivered === 'object' && v.delivered !== null) {
    for (const [taskId, d] of Object.entries(v.delivered as Record<string, unknown>)) {
      if (typeof d !== 'object' || d === null) continue
      const { correct, attempts, at } = d as Record<string, unknown>
      if (correct !== null && typeof correct !== 'boolean') continue
      delivered[taskId] = { correct: correct as boolean | null, attempts: Number(attempts) || 1, at: Number(at) || 0 }
    }
  }
  return {
    studentId: v.studentId,
    runId: v.runId,
    sessionId: v.sessionId,
    level: v.level,
    total: v.total as number,
    delivered,
    updatedAt: Number(v.updatedAt) || 0,
  }
}

// ---------------------------------------------------------------------------------------------
// Framdrift og status

export type ProgressStatus = 'waiting' | 'notStarted' | 'working' | 'finished'

export const PROGRESS_STATUS_LABELS: Record<ProgressStatus, string> = {
  waiting: 'Venter',
  notStarted: 'Ikke startet',
  working: 'Pågår',
  finished: 'Fullført',
}

export interface ProgressSummary {
  /** Antall leverte oppgaver. */
  done: number
  total: number
  /** Andel leverte oppgaver, 0–100. */
  percent: number
  correct: number
  wrong: number
  /** Leverte svar appen ikke retter selv. */
  ungraded: number
  status: ProgressStatus
}

export const percentOf = (done: number, total: number) => (total > 0 ? Math.round((Math.min(done, total) / total) * 100) : 0)

/**
 * Framdriften regnes bare ut fra leverte oppgaver som hører til elevens oppgaveliste. `active` er false før økta er
 * startet: da venter alle.
 */
export function summarize(delivered: Record<string, DeliveredTask>, taskIds: string[] | null, total: number, active: boolean): ProgressSummary {
  const ids = taskIds ? new Set(taskIds) : null
  const entries = Object.entries(delivered).filter(([id]) => !ids || ids.has(id))
  const done = Math.min(entries.length, total)
  const correct = entries.filter(([, d]) => d.correct === true).length
  const wrong = entries.filter(([, d]) => d.correct === false).length
  const ungraded = entries.filter(([, d]) => d.correct === null).length
  const status: ProgressStatus = total > 0 && done >= total ? 'finished' : done > 0 ? 'working' : active ? 'notStarted' : 'waiting'
  return { done, total, percent: percentOf(done, total), correct, wrong, ungraded, status }
}

// ---------------------------------------------------------------------------------------------
// Klasselista i lærerens oversikt

/**
 * Én elev i klasselista: navnet fra klasselista, og innloggingen (uid) når eleven har en konto. `duplicateOf` er satt
 * på en konto som ser ut til å være en dobbel av en annen elev i lista (samme e-post eller samme navn).
 */
export interface RosterStudent extends Student {
  uid?: string
  duplicateOf?: string
}

const norm = (value: string | undefined) => (value ?? '').trim().toLowerCase()

/**
 * Om kontoen hører til eleven i klasselista: samme e-post når begge har e-post. Bare når én av dem mangler e-post,
 * brukes samme navn (i samme klasse – lista og kontoene er alltid for én klasse).
 */
export function sameStudent(student: Pick<Student, 'name' | 'email'>, profile: Pick<UserProfile, 'name' | 'email'>) {
  const a = norm(student.email)
  const b = norm(profile.email)
  if (a && b) return a === b
  return norm(student.name) !== '' && norm(student.name) === norm(profile.name)
}

/**
 * Klasselista: elevene i klassen, koblet til elevkontoene i Firestore. Først kobles kontoer på e-post, så på navn der
 * e-posten mangler – så en konto aldri «stjeler» en elev fra kontoen med riktig e-post. Nivået er det læreren har satt
 * på kontoen (det eleven faktisk får oppgaver på). Kontoer som ikke står i lista, kommer til slutt; ser de ut som en
 * dobbel av en elev i lista, er de merket med `duplicateOf`, så læreren kan rydde opp.
 */
export function buildRoster(students: Student[], profiles: UserProfile[]): RosterStudent[] {
  const accounts = profiles.filter((p) => p.role === 'student')
  const linkedTo = new Map<string, UserProfile>()
  const used = new Set<string>()
  const link = (match: (s: Student, p: UserProfile) => boolean) => {
    for (const student of students) {
      if (linkedTo.has(student.id)) continue
      const profile = accounts.find((p) => !used.has(p.uid) && match(student, p))
      if (profile) {
        linkedTo.set(student.id, profile)
        used.add(profile.uid)
      }
    }
  }
  link((s, p) => !!norm(s.email) && norm(s.email) === norm(p.email))
  link(sameStudent)

  const linked = students.map((student): RosterStudent => {
    const profile = linkedTo.get(student.id)
    return profile ? { ...student, uid: profile.uid, email: profile.email ?? student.email, level: profile.level ?? student.level } : student
  })
  const extra = accounts
    .filter((p) => !used.has(p.uid))
    .map((p): RosterStudent => {
      const twin = linked.find((s) => (norm(s.email) && norm(s.email) === norm(p.email)) || norm(s.name) === norm(p.name))
      return { id: p.uid, uid: p.uid, name: p.name, level: p.level ?? 1, email: p.email, ...(twin && { duplicateOf: twin.name }) }
    })
  return [...linked, ...extra]
}

/**
 * Sjekker en ny elevkonto før den lages. Gir en feilmelding når kontoen ville gitt en dobbel elev – ellers eleven i
 * klasselista kontoen blir koblet til (null når eleven ikke står i lista).
 */
export function checkNewStudent(
  roster: RosterStudent[],
  input: { name: string; email: string },
): { error: string } | { match: RosterStudent | null } {
  const email = norm(input.email)
  const name = norm(input.name)
  const sameEmail = roster.find((s) => s.uid && norm(s.email) === email)
  if (sameEmail) return { error: `${sameEmail.name} har allerede en konto med e-posten ${input.email.trim()}.` }
  const byEmail = roster.find((s) => !s.uid && norm(s.email) === email)
  if (byEmail && norm(byEmail.name) !== name) {
    return { error: `E-posten ${input.email.trim()} hører til ${byEmail.name} i klasselista. Bruk det navnet, eller en annen e-post.` }
  }
  const match = byEmail ?? roster.find((s) => !s.uid && !norm(s.email) && norm(s.name) === name) ?? null
  if (!match) {
    const sameName = roster.find((s) => norm(s.name) === name)
    if (sameName && !sameName.uid) {
      return { error: `${sameName.name} står i klasselista med e-posten ${sameName.email}. Bruk den e-posten, så blir kontoen koblet til ${sameName.name}.` }
    }
    if (sameName) return { error: `${sameName.name} har allerede en konto. Fjern den gamle kontoen først, eller skriv navnet slik at elevene kan skilles fra hverandre.` }
  }
  return { match }
}

/** Nivået eleven får oppgaver på: det læreren har satt på kontoen, ellers nivået i klasselista, ellers nivå 1. */
export function studentLevel(profile: Pick<UserProfile, 'level' | 'email' | 'name'> | null | undefined, students: Student[]): Level {
  if (profile?.level) return profile.level
  const listed = profile && (students.find((s) => !!norm(s.email) && norm(s.email) === norm(profile.email)) ?? students.find((s) => sameStudent(s, profile)))
  return listed?.level ?? 1
}

export interface StudentOverview {
  student: RosterStudent
  /** Nivået eleven fikk oppgaver på i denne økta. */
  level: Level
  summary: ProgressSummary
  delivered: Record<string, DeliveredTask>
}

/**
 * Lærerens oversikt over gjennomføringen: hver elev i klasselista med framdriften sin. Bare dokumenter fra akkurat
 * denne gjennomføringen teller, så en ny økt aldri arver framdrift fra en tidligere.
 */
export function classOverview(
  roster: RosterStudent[],
  docs: ProgressDoc[],
  runId: string | null,
  tasks: SessionTask[],
  active: boolean,
): StudentOverview[] {
  return roster.map((student) => {
    const doc = runId && student.uid ? docs.find((d) => d.runId === runId && d.studentId === student.uid) : undefined
    const levelTasks = tasks.filter((t) => t.level === (doc?.level ?? student.level))
    const total = doc?.total ?? levelTasks.length
    const delivered = doc?.delivered ?? {}
    // Oppgaver eleven fikk, men som læreren har endret siden, telles likevel (eleven leverte dem).
    return { student, level: doc?.level ?? student.level, summary: summarize(delivered, null, total, active), delivered }
  })
}

export function overviewCounts(rows: StudentOverview[]) {
  return rows.reduce(
    (acc, { summary }) => {
      if (summary.status === 'finished') acc.finished += 1
      else if (summary.status === 'working') acc.working += 1
      else acc.notStarted += 1
      return acc
    },
    { notStarted: 0, working: 0, finished: 0 },
  )
}

// ---------------------------------------------------------------------------------------------
// Elevens svar i nettleseren, så de er der etter omlasting (og etter ny innlogging i samme nettleser)

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const answersKey = (uid: string, runId: string) => `laerestien:svar:${uid}:${runId}`

export interface SavedRun {
  /** Oppgaven eleven sist var på. */
  index: number
  answers: Record<string, TaskAnswerState>
}

const isAnswerState = (value: unknown): value is TaskAnswerState => {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.answer !== 'string') return false
  if ('phase' in v) return ['answering', 'correct', 'revealed'].includes(v.phase as string) && Number.isInteger(v.attemptsLeft)
  return typeof v.submitted === 'boolean'
}

export function loadRun(storage: StorageLike | null, key: string): SavedRun {
  const empty: SavedRun = { index: 0, answers: {} }
  if (!storage) return empty
  try {
    const data = JSON.parse(storage.getItem(key) ?? 'null') as unknown
    if (typeof data !== 'object' || data === null) return empty
    const { index, answers } = data as Record<string, unknown>
    const valid = Object.entries(typeof answers === 'object' && answers !== null ? answers : {}).filter(([, s]) => isAnswerState(s))
    // Dialogen «Det ble ikke riktig» er aldri åpen etter omlasting.
    const restored = Object.fromEntries(valid.map(([id, s]) => [id, isMathState(s as TaskAnswerState) ? { ...(s as object), dialogOpen: false } : s]))
    return { index: Number.isInteger(index) && (index as number) >= 0 ? (index as number) : 0, answers: restored as Record<string, TaskAnswerState> }
  } catch {
    return empty
  }
}

export function saveRun(storage: StorageLike | null, key: string, run: SavedRun) {
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(run))
  } catch {
    // Ikke kritisk – svarene ligger fortsatt hos læreren (levert) og i minnet.
  }
}

/** Leverte oppgaver i den lagrede gjennomføringen (det eleven ser som «ferdig»). */
export function deliveredIds(run: SavedRun, taskIds: string[]) {
  return taskIds.filter((id) => deliveryOf(run.answers[id]) !== null)
}
