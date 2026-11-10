import { answerOf, answerProblem, expressionOf, formatNumber } from '../features/tasks/taskUtils.ts'
import { strategySupport } from '../features/topics/multiplicationStrategies.ts'
import type { LevelGroup, Operator, SessionTask, TaskProfile } from '../types/index.ts'
import {
  MAX_EXISTING_TASKS,
  MAX_REFERENCE_TASKS,
  type AiExistingTask,
  type AiLevelContext,
  type AiReferenceTask,
  type AiSessionProfile,
} from './contract.ts'

// Velger noen gode eksempler fra økta, så nye AI-oppgaver passer inn. Bare det eleven ser og
// fasiten sendes – ikke ID-er, status, opphav, figurer eller elevdata.
// Importene har .ts-endelse, så filen også kan testes direkte i Node (npm test).

const TEXT_TASK = 'Tekstoppgave'

export const taskTypeOf = (task: SessionTask) => (task.kind === 'text' ? TEXT_TASK : task.type)

/** Oppgaven slik eleven ser den, med fasit. */
export function toReferenceTask(task: SessionTask): AiReferenceTask {
  if (task.kind === 'text') {
    return { taskType: TEXT_TASK, studentText: task.text.trim(), solution: task.solution.trim() }
  }
  return {
    taskType: task.type,
    studentText: `${task.instruction.trim()} ${expressionOf(task)} =`.trim(),
    solution: formatNumber(answerOf(task)),
  }
}

/**
 * Prioritet som eksempel (lavest først), eller null når oppgaven ikke skal brukes:
 * 0 lærerens egne eller endrede, 1 arbeidsark, 2 generert av appen, 3 AI-oppgaver læreren har
 * gjennomgått. AI-oppgaver som ikke er gjennomgått brukes aldri – da ville AI-en etter hvert bare
 * etterligne seg selv.
 */
export function referencePriority(task: SessionTask): number | null {
  if (task.aiGenerated) return task.reviewed ? 3 : null
  if (task.source === 'teacher') return 0
  if (task.source === 'worksheet') return 1
  return 2
}

/**
 * Om oppgaven kan brukes som eksempel. Oppgaver med figur kan ikke gjengis uten figuren, og
 * AI-en kan ikke lage figurer – de sendes derfor ikke. Uferdige oppgaver (f.eks. «0 + 0») heller ikke.
 */
export function isUsableReference(task: SessionTask) {
  if (referencePriority(task) === null) return false
  if (task.kind === 'text') return !task.figure && task.text.trim().length > 0 && task.solution.trim().length > 0
  return answerProblem(task) === null && !(task.a === 0 && task.b === 0)
}

/** Oppgavetypene etter hvor vanlige de er (flest først; ved likt antall den som kommer først). */
function typesByCount(tasks: SessionTask[]) {
  const counts = new Map<string, number>()
  for (const task of tasks) counts.set(taskTypeOf(task), (counts.get(taskTypeOf(task)) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count }))
}

/** `count` elementer spredt jevnt utover lista (første, midterste, siste …). */
function spread<T>(items: T[], count: number) {
  if (count >= items.length) return items
  if (count <= 0) return []
  if (count === 1) return [items[0]]
  return Array.from({ length: count }, (_, i) => items[Math.round((i * (items.length - 1)) / (count - 1))])
}

/** De beste `count` av én type: høyest prioritet først, spredt utover rekkefølgen innenfor samme prioritet. */
function bestOfType(tasks: SessionTask[], count: number) {
  const chosen: SessionTask[] = []
  for (const priority of [0, 1, 2, 3]) {
    chosen.push(...spread(tasks.filter((t) => referencePriority(t) === priority), count - chosen.length))
    if (chosen.length >= count) break
  }
  return chosen
}

/**
 * Representative oppgaver for ett nivå i én økt, i samme rekkefølge som i oppgavesettet.
 * Plassene fordeles etter hvor vanlige oppgavetypene er: en type får bare plass når den utgjør
 * minst én av `max` plasser – ellers går plassen til den vanligste typen. Når settet domineres av
 * korte regnestykker, blir eksemplene derfor korte regnestykker.
 */
export function selectReferenceTasks(levelTasks: SessionTask[], max = MAX_REFERENCE_TASKS): SessionTask[] {
  const usable = levelTasks.filter(isUsableReference)
  const types = typesByCount(usable)
  const slots = types.map(({ count }) => Math.floor((max * count) / usable.length))
  if (types.length) slots[0] += max - slots.reduce((a, b) => a + b, 0)

  const chosen: SessionTask[] = []
  let carry = 0
  types.forEach(({ type }, i) => {
    const picked = bestOfType(usable.filter((t) => taskTypeOf(t) === type), slots[i] + carry)
    carry = slots[i] + carry - picked.length
    chosen.push(...picked)
  })
  return usable.filter((t) => chosen.includes(t))
}

const operationNames: Record<Operator, string> = { '+': 'addisjon (+)', '-': 'subtraksjon (−)', '*': 'gange (·)', '/': 'deling (:)' }

/** Øktprofilen slik AI-en får den. */
export function toAiProfile(profile: TaskProfile): AiSessionProfile {
  return {
    focus: profile.focus,
    operations: profile.operations.map((op) => operationNames[op]),
    ...(profile.factors && { factors: profile.factors }),
    ...(profile.units && { units: profile.units }),
    formats: profile.formats,
    steps: profile.steps,
    avoid: profile.avoid,
    ...(profile.area && { area: profile.area }),
    ...(profile.area && profile.secondaryAreas?.length && { secondaryAreas: profile.secondaryAreas }),
    ...(profile.allowSwappedFactors && { allowSwappedFactors: true }),
    ...(profile.strategyFocus && { strategyFocus: true }),
    ...(profile.requiresCarry && { requiresCarry: true }),
  }
}

/**
 * Oppgavene som allerede finnes på nivået, kort: regnestykker som tall og regneart, tekstoppgaver
 * som (forkortet) tekst. Alle tas med – også AI-oppgaver læreren ikke har gjennomgått – så AI-en og
 * serveren kan unngå like oppgaver. Ingen ID-er, status, fasiter eller elevdata.
 */
export function summarizeExisting(levelTasks: SessionTask[]): AiExistingTask[] {
  return levelTasks.slice(0, MAX_EXISTING_TASKS).map((task): AiExistingTask => {
    if (task.kind === 'text') {
      return { taskType: TEXT_TASK, text: task.text.trim().slice(0, 300), ...(task.figure && { figure: true }) }
    }
    return { taskType: task.type, instruction: task.instruction.trim(), a: task.a, operator: task.operator, b: task.b }
  })
}

/**
 * Nivå 1–3 i økta: nivåbeskrivelsen (øktens egen når den finnes), tallområdet fra øktprofilen
 * og representative oppgaver. Det AI-en får om oppgavesettet.
 *
 * Har økta et fagområde (multiplikasjon), velger serveren referansene fra referansebanken. Da
 * sendes ingen av øktas oppgaver som referanser – bare en oppsummering av dem.
 */
export function buildLevelContexts(levels: LevelGroup[], tasks: SessionTask[], profile?: TaskProfile): AiLevelContext[] {
  return ([1, 2, 3] as const).map((level) => {
    const group = levels.find((g) => g.level === level)
    const own = profile?.levels[level]
    const usable = tasks.filter((t) => t.level === level && isUsableReference(t))
    if (profile?.area) {
      const levelTasks = tasks.filter((t) => t.level === level)
      return {
        level,
        title: own?.title ?? group?.title ?? '',
        subtitle: own?.subtitle ?? group?.subtitle ?? '',
        description: own?.description ?? group?.description ?? '',
        dominantTaskType: typesByCount(levelTasks)[0]?.type ?? '',
        ...(own?.numbers && { numbers: own.numbers }),
        ...(own?.factors && { factors: own.factors }),
        ...(own?.units && { units: own.units }),
        referenceTasks: [],
        existing: summarizeExisting(levelTasks),
        ...(profile.strategyFocus
          ? { support: strategySupport(level, own?.factors ?? profile.factors ?? []) }
          : own?.support && { support: own.support }),
      }
    }
    return {
      level,
      title: own?.title ?? group?.title ?? '',
      subtitle: own?.subtitle ?? group?.subtitle ?? '',
      description: own?.description ?? group?.description ?? '',
      dominantTaskType: typesByCount(usable)[0]?.type ?? '',
      ...(own?.numbers && { numbers: own.numbers }),
      ...(own?.factors && { factors: own.factors }),
      ...(own?.units && { units: own.units }),
      referenceTasks: selectReferenceTasks(tasks.filter((t) => t.level === level)).map(toReferenceTask),
    }
  })
}
