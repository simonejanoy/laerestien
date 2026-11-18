import { autoAnswerOf } from '../../ai/autoAnswer.ts'
import { readStoredVisual } from '../../ai/contract.ts'
import { answerStatus, blankRowIn, dotLayout, drawableColors, joinBoxAnswers, partCorrect, splitBoxAnswers } from '../../ai/patternDisplay.ts'
import { slotCount } from '../../ai/taskText.ts'
import type { Operator, SessionTask, Task, TextTask } from '../../types/index.ts'
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
    if (task.answerBoxes && !blankRowIn(task.text)) return 'Oppgaven skal ha inputbokser, men teksten har ingen tallrekke med tomme felt (___).'
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
    if (figure.kind === 'colors') return drawableColors(figure.items) ? null : 'Fargemønsteret har farger appen ikke kan tegne, eller er for langt.'
    if (figure.kind === 'dots') return dotLayout(figure.counts) ? null : 'Prikkene følger ikke lik økning, kvadrattall eller trekanttall, eller er for mange til å tegnes.'
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
  /**
   * Bare oppgaver med et svar som rettes automatisk (Mønster og algoritmer): «retry» etter første feil svar,
   * «correct» eller «revealed» (riktig svar vist etter andre feil) når oppgaven er ferdig, og «several» når svaret har
   * flere ulike svar («14 eller 15») – da bes eleven skrive ett svar, uten at det teller som et forsøk.
   */
  result?: 'correct' | 'retry' | 'revealed' | 'several'
  /** Antall feil svar så langt. */
  wrongTries?: number
  /** Regning: forklaringen eleven skriver under tabellen eller likningen (rettes ikke). */
  explanation?: string
  /** Oppgaver med a) og b), og Regning med flere spørsmål: svaret på hver del (svaret over er delene samlet). */
  parts?: string[]
  /** Regning med flere spørsmål: om hver del var riktig ved siste retting. */
  partResults?: boolean[]
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

/** Resultatet av en ferdig oppgave: riktig eller ikke, og hvor mange forsøk eleven brukte. */
export interface TaskResultSummary {
  correct: boolean
  attempts: number
}

/**
 * Resultatet når oppgaven er ferdig rettet, ellers null: regnestykker er ferdige når svaret er riktig eller vist etter
 * siste forsøk, tekstoppgaver når et automatisk rettet svar er riktig eller vist. Tekstsvar læreren vurderer selv
 * (uten svar som rettes automatisk), gir ikke noe resultat.
 */
export function finalResultOf(state: TaskAnswerState): TaskResultSummary | null {
  if (isMathState(state)) {
    if (state.phase === 'correct') return { correct: true, attempts: MAX_ATTEMPTS - state.attemptsLeft + 1 }
    if (state.phase === 'revealed') return { correct: false, attempts: MAX_ATTEMPTS }
    return null
  }
  if (state.result === 'correct') return { correct: true, attempts: (state.wrongTries ?? 0) + 1 }
  if (state.result === 'revealed') return { correct: false, attempts: state.wrongTries ?? TEXT_ATTEMPTS }
  return null
}

/** Om oppgaven er påbegynt (noe å tømme). */
export function hasAnswerState(state: TaskAnswerState | undefined) {
  if (!state) return false
  if (isMathState(state)) {
    return state.answer !== '' || state.phase !== 'answering' || state.attemptsLeft !== MAX_ATTEMPTS || state.showHint || state.dialogOpen
  }
  return state.answer !== '' || state.submitted || state.result !== undefined || (state.wrongTries ?? 0) > 0 || !!state.explanation || !!state.parts?.some(Boolean)
}

/** Tilbakemeldingene eleven får. Fasiten vises aldri før eleven har levert. */
export const FEEDBACK = {
  correct: 'Riktig!',
  retry: 'Ikke helt – prøv igjen.',
  /** Åpne svar (forklaringer, tegninger og oppgaver uten entydig fasit): appen later ikke som den kan rette dem. */
  sent: 'Svaret er sendt til læreren.',
} as const

/** Tilbakemeldingen etter at eleven har sjekket eller levert, eller null før det. */
export function feedbackOf(state: TaskAnswerState): string | null {
  if (isMathState(state)) return state.phase === 'correct' ? FEEDBACK.correct : state.dialogOpen ? FEEDBACK.retry : null
  if (state.result === 'correct') return FEEDBACK.correct
  if (state.result === 'retry') return FEEDBACK.retry
  if (state.submitted && state.result === undefined) return FEEDBACK.sent
  return null
}

/** Tekstoppgaver som rettes automatisk: eleven får ett nytt forsøk etter første feil svar. */
export const TEXT_ATTEMPTS = 2

/**
 * «Sjekk svaret mitt» på en oppgave med et svar som rettes automatisk (se autoAnswerOf): riktig, ett forsøk til, eller
 * riktig svar vises. Åpne svar rettes ikke: de leveres og sendes til læreren.
 */
export function checkTextAnswer(state: TextTaskState, task: TextTask): TextTaskState {
  const expected = autoAnswerOf(task)
  if (!expected) return { ...state, submitted: true }
  if (expected.kind === 'parts') {
    // Hver del rettes for seg. Er alle riktige: «Riktig!». Ellers ett nytt forsøk, og så vises riktig svar.
    const partResults = expected.parts.map((p, i) => partCorrect(p.answer, state.parts?.[i] ?? ''))
    if (partResults.every(Boolean)) return { ...state, partResults, submitted: true, result: 'correct' }
    const wrongTries = (state.wrongTries ?? 0) + 1
    return wrongTries >= TEXT_ATTEMPTS ? { ...state, partResults, wrongTries, submitted: true, result: 'revealed' } : { ...state, partResults, wrongTries, result: 'retry' }
  }
  const status = answerStatus(expected, state.answer, task.text)
  if (status === 'correct') return { ...state, submitted: true, result: 'correct' }
  if (status === 'several') return { ...state, result: 'several' }
  const wrongTries = (state.wrongTries ?? 0) + 1
  return wrongTries >= TEXT_ATTEMPTS ? { ...state, wrongTries, submitted: true, result: 'revealed' } : { ...state, wrongTries, result: 'retry' }
}

/**
 * Om eleven får se løsningsforslaget etter rettingen. Fasiten til AI-oppgaver læreren ikke har gått gjennom, vises ikke
 * (bare riktig svar) – den er skrevet for læreren og ikke kontrollert av et menneske.
 */
export const showsSolution = (task: TextTask) => !task.aiGenerated || task.reviewed

/** Overskriften over løsningsforslaget: et eksempel på en forklaring når oppgaven ber eleven forklare. */
export const solutionHeading = (task: TextTask) => (/\b(forklar|begrunn)/i.test(task.text) ? 'Eksempel på en forklaring' : 'Løsningsforslag')

/**
 * Regning: hvor mange felt eleven fyller ut i selve teksten (tomme ruter i tabeller og □ i likninger), og om de vises
 * som inputbokser. I Regning (`textBoxes`) vises de alltid som bokser – også når oppgaven mangler svaret som rettes
 * automatisk (f.eks. et oppgavesett lagret før det fantes, eller en oppgave læreren har redigert). Ellers bare når
 * svaret har like mange tall som feltene.
 */
export function textSlots(task: TextTask, shownText: string, textBoxes: boolean): { total: number; inText: boolean } {
  const { cells, boxes } = slotCount(shownText)
  const total = cells + boxes
  const matches = task.expected?.kind === 'numbers' && task.expected.values.length === total
  return { total, inText: total > 0 && (textBoxes || matches) }
}

/** Svaret etter at eleven har skrevet i boks nr. `index` (bare sifre, høyst seks). Boksene lagres som «13, 10». */
export function typeInSlot(answer: string, total: number, index: number, value: string): string {
  const values = splitBoxAnswers(answer, total)
  return joinBoxAnswers(values.map((v, k) => (k === index ? value.replace(/\D/g, '').slice(0, 6) : v)))
}
