import { readStoredVisual } from '../../ai/contract.ts'
import type { Operator, SessionTask, Task } from '../../types/index.ts'
import { answerOf, answerProblem, expressionOf, formatNumber } from '../tasks/taskUtils.ts'

// Felles regler for elevvisningen – brukes både av eleven og av lærerens forhåndsvisning.
// Rene funksjoner (ingen React), så de kan testes direkte i Node. Importene har .ts-endelse.

/** «Vi legger sammen» osv. – ut fra regneartene i oppgavene. */
export function verbFor(tasks: SessionTask[]) {
  const ops: Operator[] = tasks.flatMap((t) => (t.kind === 'text' ? [] : [t.operator]))
  if (ops.length === 0) return 'Nå setter vi i gang'
  if (ops.includes('/')) return 'Vi deler'
  if (ops.includes('*')) return 'Vi ganger'
  if (ops.includes('-')) return 'Vi trekker fra'
  return 'Vi legger sammen'
}

/** Svarfeltet for regnestykker tar bare sifre, høyst seks (se TaskScreen). */
const MAX_ANSWER_DIGITS = 6
const CLOCK_TIME = /^([01]?\d|2[0-3]):[0-5]\d$/

/**
 * Hvorfor oppgaven ikke kan vises eller besvares riktig i elevvisningen – eller null når den kan.
 * Brukes i lærerens forhåndsvisning, så oppgaven ikke ser tom ut eller mister deler uten forklaring.
 */
export function previewProblem(task: SessionTask): string | null {
  if (task.kind === 'text') {
    if (!task.text.trim()) return 'Oppgaveteksten er tom, så eleven ser ingen oppgave.'
    const figure = task.figure
    if (!figure) return null
    if (figure.kind === 'grid') {
      return figure.rows.some((row) => row.includes('#')) ? null : 'Rutefiguren er tom, så eleven ser ingen figur.'
    }
    if (figure.kind === 'clock') {
      return CLOCK_TIME.test(figure.time) ? null : `Klokkeslettet «${figure.time}» kan ikke vises på klokka.`
    }
    if (figure.kind === 'shape') return readStoredVisual(figure) ? null : 'Figuren er en type elevvisningen ikke kan tegne.'
    if (figure.kind === 'angle') return readStoredVisual(figure) ? null : 'Vinkeltypen passer ikke gradtallet, så vinkelen kan ikke tegnes riktig.'
    return 'Figuren har et format elevvisningen ikke kan vise.'
  }

  const problem = answerProblem(task)
  if (problem) return `${problem} (${expressionOf(task)}). Eleven kan ikke få riktig svar.`
  const answer = answerOf(task)
  if (!Number.isInteger(answer)) {
    return `Svaret (${formatNumber(answer)}) er ikke et helt tall. Eleven kan bare skrive hele tall.`
  }
  if (String(answer).length > MAX_ANSWER_DIGITS) {
    return `Svaret (${formatNumber(answer)}) har flere enn ${MAX_ANSWER_DIGITS} sifre. Eleven kan ikke skrive det inn.`
  }
  if (!task.instruction.trim()) return 'Instruksjonen er tom, så eleven ser bare regnestykket.'
  return null
}

// ---------------------------------------------------------------------------------------------
// Tilstanden til én oppgave mens eleven svarer. Eleven har den inne i oppgaveskjermen;
// lærerens forhåndsvisning holder den selv per oppgave-ID, så den beholdes når læreren blar.
// Overgangene er de samme begge steder, så riktig/galt avgjøres likt.

export const MAX_ATTEMPTS = 3

export type MathPhase = 'answering' | 'correct' | 'revealed'

export interface MathTaskState {
  answer: string
  phase: MathPhase
  attemptsLeft: number
  showHint: boolean
  /** «Det ble ikke riktig denne gangen» er åpen. */
  dialogOpen: boolean
}

export interface TextTaskState {
  answer: string
  submitted: boolean
}

export type TaskAnswerState = MathTaskState | TextTaskState

export const initialMathState = (): MathTaskState => ({
  answer: '',
  phase: 'answering',
  attemptsLeft: MAX_ATTEMPTS,
  showHint: false,
  dialogOpen: false,
})

export const initialTextState = (): TextTaskState => ({ answer: '', submitted: false })

export const isMathState = (state: TaskAnswerState): state is MathTaskState => 'phase' in state

/** Svarfeltet for regnestykker tar bare sifre, høyst seks. */
export const cleanMathAnswer = (value: string) => value.replace(/\D/g, '').slice(0, MAX_ANSWER_DIGITS)

/** «Sjekk svaret mitt» (med et svar skrevet inn): riktig, nytt forsøk eller svaret vises. */
export function checkMathAnswer(state: MathTaskState, task: Task): MathTaskState {
  if (Number(state.answer) === answerOf(task)) return { ...state, phase: 'correct' }
  const attemptsLeft = state.attemptsLeft - 1
  return attemptsLeft === 0 ? { ...state, attemptsLeft, phase: 'revealed' } : { ...state, attemptsLeft, dialogOpen: true }
}

/** Nytt forsøk etter feil svar, med eller uten hint. */
export const retryMathAnswer = (state: MathTaskState, withHint: boolean): MathTaskState => ({
  ...state,
  dialogOpen: false,
  answer: '',
  showHint: state.showHint || withHint,
})

/** Om oppgaven er påbegynt (noe å tømme). */
export function hasAnswerState(state: TaskAnswerState | undefined) {
  if (!state) return false
  if (isMathState(state)) {
    return state.answer !== '' || state.phase !== 'answering' || state.attemptsLeft !== MAX_ATTEMPTS || state.showHint || state.dialogOpen
  }
  return state.answer !== '' || state.submitted
}
