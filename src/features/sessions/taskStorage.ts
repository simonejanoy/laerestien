import { readStoredVisual, type AiTaskMeta } from '../../ai/contract.ts'
import type { Operator, SessionTask, TaskFigure, TaskSource, TaskType } from '../../types/index.ts'

// Varig lagring av øktenes oppgavesett i nettleseren (prototype – ingen backend).
// Bare oppgavesettene læreren har lagret, med AI-metadata. Aldri elevsvar, elevfremgang,
// elevprofiler, individuelle elevforslag eller andre personopplysninger.
// Hver oppgave leses og skrives felt for felt, så ingen ukjente felt følger med.
// Rene funksjoner (ingen React), så de kan testes i Node. Importene har .ts-endelse.

export const TASK_STORAGE_KEY = 'laerestien:oppgavesett:v1'
export const TASK_STORAGE_VERSION = 1

/** Det lagringen trenger av `localStorage` (testene bruker en egen i minnet). */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const STORAGE_NOTICES = {
  blocked: 'Nettleseren tillater ikke lagring. Endringer i oppgavene forsvinner når siden lastes på nytt.',
  corrupt: 'De lagrede oppgavene kunne ikke leses. Standardoppgavene vises.',
  unknownVersion: 'De lagrede oppgavene er fra en annen versjon av appen og ble ikke brukt. Standardoppgavene vises.',
  saveFailed: 'Endringene kunne ikke lagres i nettleseren. De forsvinner når siden lastes på nytt.',
} as const

export type TaskSets = Record<string, SessionTask[]>

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isString = (value: unknown): value is string => typeof value === 'string'
const isLevel = (value: unknown): value is 1 | 2 | 3 => value === 1 || value === 2 || value === 3
const TASK_TYPES: TaskType[] = ['Hoderegning', 'Oppstilling']
const OPERATORS: Operator[] = ['+', '-', '*', '/']
const SOURCES: TaskSource[] = ['teacher', 'worksheet', 'generated']

function readAiMeta(value: unknown): AiTaskMeta | undefined {
  if (!isObject(value)) return undefined
  const { model, rulesVersion, referenceIds, requestId, createdAt, area, level, format, fallbackUsed, referenceSeed } = value
  if (![model, rulesVersion, requestId, createdAt].every(isString) || !isLevel(level) || typeof fallbackUsed !== 'boolean') return undefined
  if (format !== 'regnestykke' && format !== 'tekst') return undefined
  return {
    model: model as string,
    rulesVersion: rulesVersion as string,
    referenceIds: Array.isArray(referenceIds) ? referenceIds.filter(isString) : [],
    requestId: requestId as string,
    createdAt: createdAt as string,
    ...(isString(area) && { area }),
    level,
    format,
    fallbackUsed,
    ...(Number.isInteger(referenceSeed) && { referenceSeed: referenceSeed as number }),
  }
}

function readFigure(value: unknown): TaskFigure | undefined {
  if (!isObject(value)) return undefined
  if (value.kind === 'grid' && Array.isArray(value.rows) && value.rows.every(isString)) return { kind: 'grid', rows: value.rows }
  if (value.kind === 'clock' && isString(value.time)) return { kind: 'clock', time: value.time }
  // Plane figurer og vinkler (geometri). En ukjent figur leses ikke inn – oppgaven beholdes uten figur.
  return readStoredVisual(value) ?? undefined
}

/** Én oppgave med bare kjente felt, eller null når den ikke er gyldig. */
export function readStoredTask(value: unknown): SessionTask | null {
  if (!isObject(value) || !isString(value.id) || !isLevel(value.level)) return null
  const source = SOURCES.includes(value.source as TaskSource) ? { source: value.source as TaskSource } : {}
  const aiMeta = readAiMeta(value.aiMeta)
  const meta = aiMeta ? { aiMeta } : {}

  if (value.kind === 'text') {
    const { text, solution, competenceGoal, adaptation, aiGenerated, reviewed } = value
    if (![text, solution, competenceGoal, adaptation].every(isString)) return null
    const figure = readFigure(value.figure)
    return {
      kind: 'text',
      id: value.id,
      level: value.level,
      text: text as string,
      solution: solution as string,
      competenceGoal: competenceGoal as string,
      adaptation: adaptation as string,
      aiGenerated: aiGenerated === true,
      reviewed: reviewed === true,
      ...(figure && { figure }),
      ...source,
      ...meta,
    }
  }

  const { type, instruction, a, operator, b } = value
  if (value.kind !== undefined && value.kind !== 'math') return null
  if (!TASK_TYPES.includes(type as TaskType) || !isString(instruction) || !OPERATORS.includes(operator as Operator)) return null
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return {
    ...(value.kind === 'math' && { kind: 'math' as const }),
    id: value.id,
    level: value.level,
    type: type as TaskType,
    instruction,
    a: a as number,
    operator: operator as Operator,
    b: b as number,
    ...source,
    ...(typeof value.aiGenerated === 'boolean' && { aiGenerated: value.aiGenerated }),
    ...(typeof value.reviewed === 'boolean' && { reviewed: value.reviewed }),
    ...meta,
  }
}

/** Oppgavesettene som tekst, klar til lagring. Bare kjente felt tas med. */
export function serializeTaskSets(sets: TaskSets, savedAt = new Date()): string {
  const sessions = Object.fromEntries(
    Object.entries(sets).map(([id, tasks]) => [id, tasks.map(readStoredTask).filter((t): t is SessionTask => t !== null)]),
  )
  return JSON.stringify({ version: TASK_STORAGE_VERSION, savedAt: savedAt.toISOString(), sessions })
}

export interface LoadedTaskSets {
  sets: TaskSets
  /** Kort beskjed til læreren når lagringen ikke kunne brukes, ellers null. */
  notice: string | null
}

/** Leser lagrede oppgavesett. Ødelagte data eller en ukjent versjon gir ingen sett og en beskjed. */
export function parseTaskSets(raw: string | null): LoadedTaskSets {
  if (raw === null) return { sets: {}, notice: null }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { sets: {}, notice: STORAGE_NOTICES.corrupt }
  }
  if (!isObject(data) || !isObject(data.sessions)) return { sets: {}, notice: STORAGE_NOTICES.corrupt }
  if (data.version !== TASK_STORAGE_VERSION) return { sets: {}, notice: STORAGE_NOTICES.unknownVersion }
  const sets: TaskSets = {}
  for (const [id, tasks] of Object.entries(data.sessions)) {
    if (!Array.isArray(tasks)) return { sets: {}, notice: STORAGE_NOTICES.corrupt }
    sets[id] = tasks.map(readStoredTask).filter((t): t is SessionTask => t !== null)
  }
  return { sets, notice: null }
}

/** Nettleserens lagring, eller null når den er blokkert (f.eks. i privat modus eller i Node). */
export function browserStorage(): StorageLike | null {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null
  } catch {
    return null
  }
}

export function loadTaskSets(storage: StorageLike | null): LoadedTaskSets {
  if (!storage) return { sets: {}, notice: STORAGE_NOTICES.blocked }
  try {
    return parseTaskSets(storage.getItem(TASK_STORAGE_KEY))
  } catch {
    return { sets: {}, notice: STORAGE_NOTICES.blocked }
  }
}

/** Lagrer oppgavesettene. Gir en beskjed til læreren når det ikke gikk, ellers null. */
export function saveTaskSets(storage: StorageLike | null, sets: TaskSets): string | null {
  if (!storage) return STORAGE_NOTICES.saveFailed
  try {
    storage.setItem(TASK_STORAGE_KEY, serializeTaskSets(sets))
    return null
  } catch {
    return STORAGE_NOTICES.saveFailed
  }
}
