import type { TextTask } from '../types/index.ts'
import { MAX_EQUATIONS, MAX_EQUATION_OPERANDS, blankRowIn, evaluate, normalizeOperator, type EquationAnswer, type EquationSign, type ExpectedAnswer } from './patternDisplay.ts'
import { asksExplanation, hasDataBlock, lettered, operatorTemplate, slotCount } from './taskText.ts'

// Hvilke tekstoppgaver appen kan rette selv, og hvordan svaret ser ut. Appen retter bare når fasiten kan kontrolleres
// pålitelig; ellers er svaret åpent, og læreren vurderer det. Ingen AI brukes til å rette.
//
// 1. Oppgaver med et kort svar fra oppgavereglene (`expected`: tall, tallrekke, figur, farge, regnetegn eller delsvar).
// 2. Oppgaver som ber eleven skrive regnestykker («Lag to regnestykker: ett med pluss og ett med gange»), når fasiten
//    bare består av regnestykker som er regnet riktig. Eleven får ferdige rader med regnetegn: «[ ] + [ ] = [ ]».
// 3. Oppgaver med ett spørsmål der fasiten er ett helt tall («5», «5 hjørner», «90°»). Eleven får én tallboks.
// Oppgaver som ber eleven forklare, begrunne eller tegne, og oppgaver med flere spørsmål, rettes ikke.
//
// Svaret regnes ut fra teksten og fasiten hver gang, så det følger med når læreren endrer oppgaven.
// Rene funksjoner (ingen React), så de kan testes i Node. Importene har .ts-endelse.

/** Oppgaven ber eleven skrive eller lage regnestykker («regnestykke», «gangestykke», «divisjonsstykke» …). */
export const asksForEquations = (text: string) => /\b(skriv|lag)\b[^.?!\n]*stykke/i.test(text)

/** Oppgaven ber eleven tegne – det kan ikke rettes. */
const asksDrawing = (text: string) => /\btegn(e|er)?\b/i.test(text)

/**
 * Et regnestykke som er regnet riktig («4 + 4 = 8», «2 x 4 = 8», «18 : 3 = 6», «8 + 8 + 8 = 24»), ellers null. Bare hele
 * tall og ett regnetegn per stykke; minus og deling har to tall.
 */
export function parseEquation(text: string): EquationAnswer | null {
  const m = /^\s*(\d+(?:\s*[-+−·x×*:/÷]\s*\d+)+)\s*=\s*(\d+)\s*$/i.exec(text.replace(/÷/g, ':'))
  if (!m) return null
  const signs = [...new Set((m[1].match(/[-+−·x×*:/]/gi) ?? []).map((s) => normalizeOperator(s)))]
  if (signs.length !== 1 || signs[0] === null) return null
  const sign = signs[0] as EquationSign
  const operands = (m[1].match(/\d+/g) ?? []).map(Number)
  if (operands.length > MAX_EQUATION_OPERANDS) return null
  const result = Number(m[2])
  return evaluate(sign, operands) === result ? { sign, operands, result } : null
}

/**
 * Regnestykkene i fasiten, når fasiten ikke er noe annet enn regnestykker («4 + 4 = 8 og 2 · 4 = 8»). Alternativer i
 * parentes («(eller 4 · 2 = 8)») hører ikke med – byttede ledd godtas uansett. Gir null når noe i fasiten ikke er et
 * riktig regnestykke.
 */
export function equationsFromSolution(solution: string): EquationAnswer[] | null {
  const main = solution
    .split('(')[0]
    .replace(/^\s*(svar|fasit)\s*:\s*/i, '')
    .trim()
    .replace(/\.$/, '')
  const pieces = main
    .split(/\s+og\s+|[;,\n]|\.\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (pieces.length === 0 || pieces.length > MAX_EQUATIONS) return null
  const equations = pieces.map(parseEquation)
  return equations.every((e): e is EquationAnswer => e !== null) ? equations : null
}

/** Fasiten er ett helt tall, eventuelt med én enhet eller benevning («12», «12 epler», «90°», «Svar: 5 hjørner.»). */
export function numberFromSolution(solution: string): number | null {
  const m = /^\s*(?:(?:svar|fasit)\s*:\s*)?(\d{1,6})\s*(?:°|[a-zæøå]+)?\s*\.?\s*$/i.exec(solution)
  return m ? Number(m[1]) : null
}

/** Oppgaven har akkurat ett spørsmål, og ingen bokser, tabeller, deloppgaver eller regnetegn eleven velger selv. */
function oneQuestion(text: string) {
  const { cells, boxes } = slotCount(text)
  if (cells + boxes > 0 || blankRowIn(text) || hasDataBlock(text) || lettered(text)) return false
  if (text.split('\n').some((line) => operatorTemplate(line) !== null)) return false
  return (text.match(/\?/g) ?? []).length === 1
}

/**
 * Svaret appen retter oppgaven etter, eller undefined når svaret er åpent (læreren vurderer det). Se toppen av filen.
 */
export function autoAnswerOf(task: Pick<TextTask, 'text' | 'solution' | 'expected'>): ExpectedAnswer | undefined {
  if (task.expected) return task.expected
  const { text, solution } = task
  if (asksExplanation(text) || asksDrawing(text)) return undefined
  if (asksForEquations(text)) {
    const equations = equationsFromSolution(solution)
    return equations ? { kind: 'equations', equations } : undefined
  }
  if (!oneQuestion(text)) return undefined
  const value = numberFromSolution(solution)
  return value === null ? undefined : { kind: 'number', value }
}

/** Om eleven svarer med én tallboks (hele tall fra 0 og opp, høyst seks sifre) i stedet for et skrivefelt. */
export const usesNumberBox = (expected: ExpectedAnswer | undefined) =>
  expected?.kind === 'number' && Number.isInteger(expected.value) && expected.value >= 0 && expected.value < 1_000_000
