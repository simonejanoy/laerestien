import { ANGLE_NAMES, SHAPE_NAMES, degreesFit, type AngleKind, type ShapeKind } from '../../ai/contract.ts'
import type { Level, Operator, SessionTask, Task, TaskType, TextTask } from '../../types/index.ts'
import { answerProblem, expressionOf } from './taskUtils.ts'

// «Lag selv» i popupen «Legg til oppgaver»: læreren lager en oppgave helt manuelt (ingen AI). Skjemaet holder et utkast,
// og oppgaven lages først når utkastet er gyldig. Rene funksjoner (ingen React), så de kan testes i Node.

/** Regnestykke (appen retter svaret) eller tekstoppgave (med fasit/løsningsforslag og eventuelt en figur). */
export type ManualKind = 'math' | 'text'

/** Figuren til en tekstoppgave: ingen, en plan figur eller en vinkel. Appen tegner den selv (TaskFigure). */
export type ManualFigure = 'none' | 'shape' | 'angle'

export interface ManualDraft {
  level: Level
  kind: ManualKind
  /** Regnestykke. Tallene holdes som tekst, så feltene kan valideres slik læreren skrev dem. */
  instruction: string
  a: string
  operator: Operator
  b: string
  type: TaskType
  /** Tekstoppgave. */
  text: string
  solution: string
  figure: ManualFigure
  shape: ShapeKind
  angleType: AngleKind
  degrees: string
}

export const emptyManualDraft = (level: Level): ManualDraft => ({
  level,
  kind: 'math',
  instruction: 'Regn ut.',
  a: '',
  operator: '+',
  b: '',
  type: 'Hoderegning',
  text: '',
  solution: '',
  figure: 'none',
  shape: 'triangle',
  angleType: 'right',
  degrees: '90',
})

export const SHAPE_OPTIONS = Object.entries(SHAPE_NAMES) as [ShapeKind, string][]
export const ANGLE_OPTIONS = Object.entries(ANGLE_NAMES) as [AngleKind, string][]

const wholeNumber = (value: string) => (/^\d{1,6}$/.test(value.replace(/\s/g, '')) ? Number(value.replace(/\s/g, '')) : null)

/** Regnestykket i utkastet (uten ID), når tallene er hele tall – ellers null. */
function mathOf(draft: ManualDraft): Omit<Task, 'id'> | null {
  const a = wholeNumber(draft.a)
  const b = wholeNumber(draft.b)
  if (a === null || b === null) return null
  return { level: draft.level, type: draft.type, instruction: draft.instruction.trim(), a, operator: draft.operator, b, source: 'teacher' }
}

/** Hva som mangler eller er feil i utkastet, eller null når oppgaven kan lagres. */
export function manualTaskProblem(draft: ManualDraft): string | null {
  if (draft.kind === 'math') {
    if (!draft.instruction.trim()) return 'Skriv oppgaveteksten (instruksjonen eleven ser over regnestykket).'
    const math = mathOf(draft)
    if (!math) return 'Tall 1 og tall 2 må være hele tall fra 0 og oppover.'
    const problem = answerProblem({ ...math, id: '' })
    return problem ? `${problem} (${expressionOf({ ...math, id: '' })}). Sjekk tallene.` : null
  }
  if (!draft.text.trim()) return 'Skriv oppgaveteksten eleven skal lese.'
  if (!draft.solution.trim()) return 'Skriv fasit eller løsningsforslag (bare læreren ser det).'
  if (draft.figure === 'angle') {
    const degrees = wholeNumber(draft.degrees)
    if (degrees === null || !degreesFit(draft.angleType, degrees)) {
      return `Gradtallet passer ikke en ${ANGLE_NAMES[draft.angleType]} vinkel (spiss: 1–89°, rett: 90°, stump: 91–179°).`
    }
  }
  return null
}

/** Oppgaven læreren har laget, eller null når utkastet ikke er gyldig (se manualTaskProblem). */
export function buildManualTask(draft: ManualDraft, id: string): SessionTask | null {
  if (manualTaskProblem(draft)) return null
  if (draft.kind === 'math') return { ...mathOf(draft)!, id }
  const figure: TextTask['figure'] =
    draft.figure === 'shape'
      ? { kind: 'shape', shape: draft.shape }
      : draft.figure === 'angle'
        ? { kind: 'angle', angleType: draft.angleType, degrees: wholeNumber(draft.degrees)! }
        : undefined
  return {
    kind: 'text',
    id,
    level: draft.level,
    text: draft.text.trim(),
    solution: draft.solution.trim(),
    competenceGoal: '',
    adaptation: '',
    aiGenerated: false,
    reviewed: false,
    source: 'teacher',
    ...(figure && { figure }),
  }
}
