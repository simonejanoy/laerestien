import { autoAnswerOf } from '../../ai/autoAnswer.ts'
import { equationRows } from '../../ai/patternDisplay.ts'
import type { Level, SessionTask, Student, UserProfile } from '../../types/index.ts'
import { finalResultOf, isMathState, type TaskAnswerState } from '../student/studentTasks.ts'
import { expressionOf } from '../tasks/taskUtils.ts'

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
  /**
   * Økta slik læreren startet den: navnet (f.eks. «Multiplikasjon økt 7»), tema, ferdigheter og oppgavene (som JSON fra
   * taskStorage.serializeTaskSets). Eleven får nøyaktig dette – også når læreren har endret oppgavene i sin nettleser.
   * Eldre dokumenter mangler det; da brukes økta og oppgavene eleven har selv.
   */
  label?: string
  topicId?: string
  skillIds?: string[]
  tasks?: string
}

/** Det læreren legger ved når økta startes (se LiveSession). */
export type LiveSnapshot = Pick<LiveSession, 'label' | 'topicId' | 'skillIds' | 'tasks'>

/**
 * Hvor lenge en økt som er i gang eller på pause, gjelder. En undervisningsøkt varer noen timer på det meste; er den
 * eldre, har læreren glemt å avslutte den (f.eks. fra en tidligere dag), og den regnes som avsluttet. Samme grense står i
 * firestore.rules, så eleven heller ikke kan levere til en gammel økt.
 */
export const LIVE_MAX_AGE_MS = 4 * 60 * 60 * 1000

const LIVE_STATUSES: LiveStatus[] = ['running', 'paused', 'ended']

/** Om dokumentet er en gyldig økt (riktig status og starttid). Eldre eller ødelagte dokumenter er det ikke. */
export function isValidLive(live: LiveSession | null | undefined): live is LiveSession {
  return !!live && typeof live.sessionId === 'string' && LIVE_STATUSES.includes(live.status) && Number.isFinite(live.startedAt)
}

/** Om økta er så gammel at den regnes som glemt (se LIVE_MAX_AGE_MS). */
export function isExpired(live: Pick<LiveSession, 'startedAt' | 'endedAt'>, now = Date.now()) {
  return now - (live.endedAt ?? live.startedAt) >= LIVE_MAX_AGE_MS
}

/**
 * Status slik den faktisk gjelder nå: en glemt økt som står som i gang eller på pause, er avsluttet. Ugyldige dokumenter
 * gir null (ingen økt).
 */
export function effectiveStatus(live: LiveSession | null | undefined, now = Date.now()): LiveStatus | null {
  if (!isValidLive(live)) return null
  if (live.status !== 'ended' && isExpired(live, now)) return 'ended'
  return live.status
}

/**
 * Klassen økta startes for. Det er lærerens egen klasse – den samme som elevene lytter på,
 * og den eneste Firestore-reglene lar læreren skrive til.
 */
export const liveClassId = (teacherClassId: string | undefined, sessionClassName: string) => teacherClassId || sessionClassName

/** ID-en til gjennomføringen. Inneholder aldri «/», så den kan brukes i dokument-ID-er. */
export const makeRunId = (sessionId: string, startedAt: number) => `${sessionId}-${startedAt}`.replace(/\//g, '_')

export const runIdOf = (live: Pick<LiveSession, 'sessionId' | 'startedAt' | 'runId'>) => live.runId ?? makeRunId(live.sessionId, live.startedAt)

/** Ny gjennomføring av økta (det læreren skriver når hen trykker «Start økt»), med økta slik læreren har den. */
export function newLiveSession(sessionId: string, startedAt = Date.now(), snapshot: LiveSnapshot = {}): LiveSession {
  const extra = Object.fromEntries(Object.entries(snapshot).filter(([, v]) => v !== undefined)) as LiveSnapshot
  return { sessionId, status: 'running', startedAt, runId: makeRunId(sessionId, startedAt), ...extra }
}

/** Eleven kan levere svar bare mens akkurat denne gjennomføringen er i gang (ikke på pause, ikke avsluttet, ikke glemt). */
export function canDeliver(live: LiveSession | null | undefined, runId: string | null, now = Date.now()) {
  return !!runId && effectiveStatus(live, now) === 'running' && runIdOf(live!) === runId
}

/**
 * Hva eleven ser: kobler til, venter på læreren (ingen økt startet, eller en økt eleven ikke har), pause, avsluttet –
 * eller oppgavene. Oppgavene vises bare mens økta er i gang.
 */
export type StudentViewState = 'connecting' | 'failed' | 'waiting' | 'paused' | 'ended' | 'tasks'

export function studentViewState(live: LiveSession | null | undefined, sessionKnown: boolean, failed = false, now = Date.now()): StudentViewState {
  if (failed) return 'failed'
  if (live === undefined) return 'connecting'
  // Ingen økt, et ugyldig dokument eller en glemt økt fra tidligere: eleven venter på at læreren starter en.
  if (!isValidLive(live) || isExpired(live, now) || !sessionKnown) return 'waiting'
  if (live.status === 'paused') return 'paused'
  if (live.status === 'ended') return 'ended'
  return live.status === 'running' ? 'tasks' : 'waiting'
}

/** Hvordan økta står for læreren: bare planlagt, aktiv (i gang eller på pause) eller avsluttet. */
export type SessionRunState = 'planned' | 'running' | 'paused' | 'ended'

export function runStateFor(live: LiveSession | null | undefined, sessionId: string, now = Date.now()): SessionRunState {
  const status = effectiveStatus(live, now)
  if (!status || live!.sessionId !== sessionId) return 'planned'
  return status
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
  /**
   * Svaret eleven leverte (siste forsøk), så læreren kan se det i øktvisningen og vurdere åpne svar. Høyst
   * MAX_ANSWER_LENGTH tegn. Mangler i leveringer fra før feltet fantes.
   */
  answer?: string
}

/** Lengste svar som lagres med leveringen. */
export const MAX_ANSWER_LENGTH = 1000

/**
 * Elevens framdrift i én gjennomføring (Firestore: liveSessions/{classId}/progress/{runId}__{uid}). Ingen navn – bare
 * hvilke oppgaver som er levert, om de ble riktige, og svaret eleven leverte. Bare læreren i klassen kan lese det.
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
  const answer = answerTextOf(state)
  const withAnswer = answer ? { answer } : {}
  if (isMathState(state)) return result ? { correct: result.correct, attempts: result.attempts, at, ...withAnswer } : null
  if (!state.submitted) return null
  return result ? { correct: result.correct, attempts: result.attempts, at, ...withAnswer } : { correct: null, attempts: 1, at, ...withAnswer }
}

/** Svaret slik det lagres for læreren: det eleven skrev (og forklaringen, når oppgaven ba om en), forkortet ved behov. */
export function answerTextOf(state: TaskAnswerState): string {
  const explanation = !isMathState(state) && state.explanation?.trim() ? `\nForklaring: ${state.explanation.trim()}` : ''
  return `${state.answer.trim()}${explanation}`.slice(0, MAX_ANSWER_LENGTH)
}

/**
 * Det leverte svaret slik læreren ser det. Regnestykker vises med stykket («7 · 8 = 56»), og regnestykker eleven
 * skrev i bokser vises som regnestykker («4 + 4 = 8; 2 · 4 = 8»). Ellers vises svaret som det ble skrevet.
 */
export function shownAnswer(task: SessionTask | undefined, answer: string): string {
  if (!task) return answer
  if (task.kind !== 'text') return `${expressionOf(task)} = ${answer}`
  const expected = autoAnswerOf(task)
  if (expected?.kind !== 'equations') return answer
  return equationRows(answer, expected.equations)
    .map((row, i) => `${row.slice(0, -1).join(` ${expected.equations[i].sign} `)} = ${row.at(-1)}`)
    .join('; ')
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
      const { correct, attempts, at, answer } = d as Record<string, unknown>
      if (correct !== null && typeof correct !== 'boolean') continue
      delivered[taskId] = {
        correct: correct as boolean | null,
        attempts: Number(attempts) || 1,
        at: Number(at) || 0,
        ...(typeof answer === 'string' && answer && { answer: answer.slice(0, MAX_ANSWER_LENGTH) }),
      }
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

/** Navn og e-post sammenlignes uten å skille på store/små bokstaver og ekstra mellomrom. */
export const norm = (value: string | undefined) => (value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Om navnet på kontoen er eleven i klasselista: samme navn, eller fornavn og forbokstav i etternavnet slik appen
 * forkorter navn («Nora L» eller «Nora L.» for «Nora Lie»). Uten å skille på store/små bokstaver og ekstra mellomrom.
 */
export function sameName(listed: string, account: string | undefined) {
  const a = norm(listed)
  const b = norm(account).replace(/\.$/, '')
  if (!a || !b) return false
  if (a === b) return true
  const [first, ...rest] = a.split(' ')
  const last = rest.at(-1)
  return !!last && b === `${first} ${last[0]}`
}

/**
 * Klasselista: elevene i klassen, koblet til elevkontoene i Firestore. Kontoene kobles i denne rekkefølgen, så en konto
 * aldri «stjeler» en elev fra en konto som passer bedre:
 * 1. samme uid (når eleven i lista har en kjent uid),
 * 2. samme e-post,
 * 3. samme navn – når en av dem mangler e-post, eller når ingen konto i klassen har e-posten eleven står med i lista
 *    (f.eks. en skrivefeil i profilen). Slik står eleven alltid på sin vanlige plass.
 * 4. forkortet navn («Nora L» for «Nora Lie»), med de samme vilkårene, og bare når det passer én elev.
 * Nivået er det som står på kontoen (det eleven faktisk får oppgaver på). Kontoer som ikke står i lista, kommer til
 * slutt; ser de ut som en dobbel av en elev i lista, er de merket med `duplicateOf`, så læreren kan rydde opp.
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
  const emailTaken = (email: string) => accounts.some((p) => norm(p.email) === email)
  link((s, p) => !!s.uid && s.uid === p.uid)
  link((s, p) => !!norm(s.email) && norm(s.email) === norm(p.email))
  const nameLink = (match: (s: Student, p: UserProfile) => boolean) =>
    link((s, p) => match(s, p) && (!norm(s.email) || !norm(p.email) || !emailTaken(norm(s.email))))
  nameLink((s, p) => norm(s.name) !== '' && norm(s.name) === norm(p.name))
  // Forkortet navn («Nora L») – bare når det passer én elev i lista.
  nameLink((s, p) => sameName(s.name, p.name) && students.filter((o) => sameName(o.name, p.name)).length === 1)

  const linked = students.map((student): RosterStudent => {
    const profile = linkedTo.get(student.id)
    return profile ? { ...student, uid: profile.uid, email: profile.email ?? student.email, level: profile.level ?? student.level } : student
  })
  const extra = accounts
    .filter((p) => !used.has(p.uid))
    .map((p): RosterStudent => {
      const twin = linked.find((s) => (norm(s.email) && norm(s.email) === norm(p.email)) || sameName(s.name, p.name))
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
  // Samme e-post som en elev i klasselista: kontoen kobles til eleven, også når navnet på kontoen er et annet
  // (navnet i klasselista er det som vises i appen).
  const byEmail = roster.find((s) => !s.uid && norm(s.email) === email)
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

/**
 * Nivået eleven får oppgaver på: det læreren har satt på kontoen, ellers nivået i klasselista (raden kontoen kobles til,
 * som i buildRoster), ellers nivå 1.
 */
export function studentLevel(profile: Pick<UserProfile, 'level' | 'email' | 'name'> & { uid?: string } | null | undefined, students: Student[]): Level {
  if (profile?.level) return profile.level
  if (!profile) return 1
  const email = norm(profile.email)
  const listed =
    (profile.uid ? students.find((s) => s.uid === profile.uid) : undefined) ??
    (email ? students.find((s) => norm(s.email) === email) : undefined) ??
    students.find((s) => norm(s.name) !== '' && norm(s.name) === norm(profile.name)) ??
    (students.filter((s) => sameName(s.name, profile.name)).length === 1 ? students.find((s) => sameName(s.name, profile.name)) : undefined)
  return listed?.level ?? 1
}

/**
 * Nivåer der økta ikke har noen oppgaver, men der det står elever i klasselista. Disse elevene ville ikke fått noen
 * oppgaver – læreren får en advarsel før og etter at økta startes.
 */
export function levelsWithoutTasks(roster: Pick<Student, 'name' | 'level'>[], tasks: Pick<SessionTask, 'level'>[]) {
  const levels = new Set(tasks.map((t) => t.level))
  return ([1, 2, 3] as Level[])
    .filter((level) => !levels.has(level))
    .map((level) => ({ level, students: roster.filter((s) => s.level === level).map((s) => s.name) }))
    .filter((missing) => missing.students.length > 0)
}

/** «Økta har ingen oppgaver på nivå 3. Ada Strand og Nora Lie får ingen oppgaver.» */
export function missingLevelsText(missing: ReturnType<typeof levelsWithoutTasks>) {
  return missing.map(({ level, students }) => {
    const names = students.length > 1 ? `${students.slice(0, -1).join(', ')} og ${students.at(-1)}` : students[0]
    return `Økta har ingen oppgaver på nivå ${level}. ${names} får ingen oppgaver.`
  })
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

/**
 * Lengst fram eleven kan gå: den første oppgaven som ikke er levert, eller avslutningen (antall oppgaver) når alle er
 * levert. Eleven kan gå tilbake til alt før, men ikke hoppe over en oppgave som ikke er fullført.
 */
export function furthestReachable(done: boolean[]) {
  const firstOpen = done.indexOf(false)
  return firstOpen === -1 ? done.length : firstOpen
}

/** Leverte oppgaver i den lagrede gjennomføringen (det eleven ser som «ferdig»). */
export function deliveredIds(run: SavedRun, taskIds: string[]) {
  return taskIds.filter((id) => deliveryOf(run.answers[id]) !== null)
}
