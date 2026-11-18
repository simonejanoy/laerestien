import { visualSignature } from '../../ai/contract.ts'
import type { Level, LevelGroup, SessionTask, TaskProfile } from '../../types/index.ts'
import { isTextSpec, tasksFor, unitSpecs, type UnitSpec } from '../topics/yearPlan.ts'

// Oppgavene i én økt: arbeidsark først, så oppgaver laget av reglene i årsplanen.
// Rene funksjoner (ingen React), så de kan testes direkte i Node. Importene har .ts-endelse.

/** Økt nr. `n` (0, 1, 2 …) i en periode som skal inn i timeplanen. */
export interface Planned {
  id: string
  spec: UnitSpec
  heading: string
  skills: string[]
  profile?: TaskProfile
  n: number
}

/** «tall:start» er Tall økt 1–6, «tall:slutt» er økt 11–14 (de har egne id-er, okt-5 til okt-8). */
export function planned(key: string): Planned[] {
  const [unitId, part] = key.split(':')
  const spec = unitSpecs.find((u) => u.unitId === unitId)
  if (!spec) return []
  const all = spec.weeks
    .flatMap((w) => w.sessions)
    .map(({ heading, skills, profile }, n) => ({ id: `${unitId}-${n + 1}`, spec, heading, skills, profile, n }))
  if (part === 'start') return all.slice(0, 6)
  // Tall økt 11–14 har id-ene okt-5 til okt-8 fra før (økt 7–10 er okt-1-2, okt-3 og okt-4).
  if (part === 'slutt') return all.slice(10).map((p, i) => ({ ...p, id: `okt-${i + 5}` }))
  return all
}

/** Nivåene i økta: øktprofilens beskrivelser der de finnes, ellers temaets. */
export function levelsFor({ spec, profile }: Pick<Planned, 'spec' | 'profile'>, taskCount: number, studentCount: number): LevelGroup[] {
  return spec.levels.map((l, i) => {
    const level = (i + 1) as Level
    const own = profile?.levels[level]
    return {
      level,
      title: own?.title ?? l.title,
      subtitle: own?.subtitle ?? l.subtitle,
      description: own?.description ?? l.description,
      taskCount,
      studentCount,
    }
  })
}

/** Oppgavene reglene lager for økta – fem per nivå, merket som generert. */
export function buildTasks({ id, skills, profile, n }: Pick<Planned, 'id' | 'skills' | 'profile' | 'n'>): SessionTask[] {
  return ([1, 2, 3] as const).flatMap((level) =>
    tasksFor(skills, level, n, profile).map((task, i): SessionTask => {
      const taskId = `${id}-n${level}-${i + 1}`
      if (isTextSpec(task)) {
        return {
          kind: 'text',
          id: taskId,
          level,
          text: task.text,
          solution: task.solution,
          ...(task.figure && { figure: task.figure }),
          ...(task.answerBoxes && { answerBoxes: true as const }),
          // Automatisk retting bare i økter med øktprofil (Mønster og algoritmer) – ikke i repetisjonsøktene.
          ...(task.expected && profile && { expected: task.expected }),
          competenceGoal: '',
          adaptation: '',
          aiGenerated: false,
          reviewed: false,
          source: 'generated',
        }
      }
      const [type, a, operator, b, instruction] = task
      return { id: taskId, level, type, instruction, a, operator, b, source: 'generated' }
    }),
  )
}

/**
 * To oppgaver på samme nivå er like når teksten, eller regnestykket, er det samme. En plan figur eller
 * vinkel hører med: samme spørsmål til en annen figur er en annen oppgave.
 */
export const sessionTaskKey = (task: SessionTask) => {
  if (task.kind !== 'text') return `${task.level}|${task.a} ${task.operator} ${task.b}`
  const visual = task.figure?.kind === 'shape' || task.figure?.kind === 'angle' ? `|${visualSignature(task.figure)}` : ''
  return `${task.level}|${task.text.trim()}${visual}`
}

/** Arbeidsarkene først, så resten. Oppgaver som er helt like en tidligere på samme nivå, tas bort. */
export function mergeTasks(...lists: SessionTask[][]): SessionTask[] {
  const seen = new Set<string>()
  return lists.flat().filter((task) => {
    const key = sessionTaskKey(task)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Antall standardoppgaver på hvert nivå i en økt. */
export const TASKS_PER_LEVEL = 5

/** Hvor «stort» et regnestykke er – brukes til å ordne standardoppgavene fra lett til vanskelig. */
const mathSize = (task: SessionTask) => {
  if (task.kind === 'text') return 0
  if (task.operator === '*') return task.a * task.b
  if (task.operator === '+') return task.a + task.b
  return task.a
}

/**
 * Standardoppgavene i en økt med like mange oppgaver på hvert nivå (høyst `perLevel`). Arbeidsarkene og oppgavene fra
 * årsplanen legges sammen, så et nivå med ark fikk tidligere flere oppgaver enn de andre. Har et nivå for mange, velges
 * oppgaver jevnt utover lista (første og siste er alltid med), så både arkoppgavene og årsplanoppgavene er med og hele
 * spennet i vanskelighetsgrad beholdes. Regnestykkene ordnes fra lett til vanskelig, og tekstoppgavene (som oftest krever
 * mest) kommer etter dem i samme rekkefølge som før. Nivåer med `perLevel` eller færre oppgaver endres ikke.
 */
export function evenLevels(tasks: SessionTask[], perLevel = TASKS_PER_LEVEL): SessionTask[] {
  return ([1, 2, 3] as const).flatMap((level) => {
    const list = tasks.filter((t) => t.level === level)
    if (list.length <= perLevel) return list
    const picked = Array.from({ length: perLevel }, (_, i) => list[Math.round((i * (list.length - 1)) / (perLevel - 1))])
    const math = picked.filter((t) => t.kind !== 'text').sort((a, b) => mathSize(a) - mathSize(b))
    return [...math, ...picked.filter((t) => t.kind === 'text')]
  })
}

/** Oppgaven er ikke endret av læreren og ikke laget med AI – samme innhold som standardoppgaven. */
const untouched = (task: SessionTask, standard: SessionTask) =>
  task.source !== 'teacher' && !task.aiGenerated && sessionTaskKey(task) === sessionTaskKey(standard)

/**
 * Et lagret oppgavesett fra før nivåene ble jevnet ut kan ha for mange standardoppgaver. Standardoppgaver som er tatt ut
 * (`full` minus `kept`), fjernes fra settet så lenge nivået har flere enn `perLevel` oppgaver. Oppgaver læreren har
 * endret eller laget selv, og AI-oppgaver, røres aldri.
 */
export function trimStoredTasks(stored: SessionTask[], full: SessionTask[], kept: SessionTask[], perLevel = TASKS_PER_LEVEL): SessionTask[] {
  const keptIds = new Set(kept.map((t) => t.id))
  const dropped = new Map(full.filter((t) => !keptIds.has(t.id)).map((t) => [t.id, t]))
  if (dropped.size === 0) return stored
  const counts = new Map<number, number>()
  for (const task of stored) counts.set(task.level, (counts.get(task.level) ?? 0) + 1)
  return stored.filter((task) => {
    const standard = dropped.get(task.id)
    if (!standard || !untouched(task, standard) || (counts.get(task.level) ?? 0) <= perLevel) return true
    counts.set(task.level, (counts.get(task.level) ?? 0) - 1)
    return false
  })
}

/**
 * Lagrede oppgavesett går foran grunnoppgavene. Et sett lagret før en grunnoppgave fikk svaret som rettes automatisk
 * (`expected`) eller inputboksene i tallrekka (`answerBoxes`), mangler dem. En lagret grunnoppgave med samme ID, tekst og
 * fasit som en grunnoppgave i økta får dem derfra. Oppgaver læreren har endret, og AI-oppgaver, endres ikke.
 */
export function refreshStoredTasks(stored: SessionTask[], fresh: SessionTask[]): SessionTask[] {
  const byId = new Map(fresh.map((t) => [t.id, t]))
  return stored.map((task) => {
    const base = byId.get(task.id)
    if (task.kind !== 'text' || base?.kind !== 'text' || task.aiGenerated || task.text !== base.text || task.solution !== base.solution) return task
    if ((task.expected || !base.expected) && (task.answerBoxes || !base.answerBoxes)) return task
    return { ...task, ...(!task.expected && base.expected && { expected: base.expected }), ...(!task.answerBoxes && base.answerBoxes && { answerBoxes: base.answerBoxes }) }
  })
}
