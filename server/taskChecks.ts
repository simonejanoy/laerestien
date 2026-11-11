import {
  isMathDraft,
  visualSignature,
  type AiExistingTask,
  type AiLevel,
  type AiLevelContext,
  type AiOperator,
  type AiTaskDraft,
  type TaskRequest,
  type TaskResult,
} from '../src/ai/contract.ts'
import { isReferenceArea, topicOfArea, type DivisionArea, type GeometryArea, type MeasurementArea, type NumbersAndOperationsArea, type ProblemSolvingArea, type ReferenceArea } from '../src/ai/contract.ts'
import { strategyProblem } from '../src/features/topics/multiplicationStrategies.ts'
import { divisionProblem, wishRequiresRoundUp } from './divisionChecks.ts'
import { geometryProblem } from './geometryChecks.ts'
import { measurementProblem } from './measurementChecks.ts'
import { numbersProblem } from './numbersAndOperationsChecks.ts'
import { problemSolvingProblem } from './problemSolvingChecks.ts'
import { visualProblem } from './visualChecks.ts'
import { divisionReferences } from './references/division.ts'
import { geometryReferences } from './references/geometry.ts'
import { numbersAndOperationsReferences } from './references/numbersAndOperations.ts'
import { isAreaOrPerimeterReference } from './references/selectReferences.ts'
import { checkEquations, checkReferenceMath } from './references/validate.ts'

// Kontroller av generelle oppgaver etter at AI-en har svart. Stiltreff styres av
// øktprofilen, referansene og AI-reglene – her sjekkes bare det som kan måles sikkert.
// Ingen nye Gemini-kall: oppgaver som ikke passer, tas bort, og læreren får beskjed om hvorfor.

const LEVELS: AiLevel[] = [1, 2, 3]

/** Tekstoppgaver som er minst så like en referanses formulering (tall ikke medregnet), avvises. Justeres etter testing. */
export const TEXT_SIMILARITY_THRESHOLD = 0.75

/**
 * En tekstoppgave med nøyaktig de samme tallene som en annen oppgave på nivået, og minst så lik
 * formulering (tall ikke medregnet), er samme oppgave med ubetydelig endret ordlyd – og avvises.
 * Med to eller flere like tall er regnestykket det samme uansett ordlyd.
 */
export const NEAR_DUPLICATE_THRESHOLD = 0.75

/**
 * Divisjon: en tekstoppgave med nøyaktig de samme tallene som en referanse, og minst så lik formulering,
 * er en nesten ordrett kopi av referansen. Lavere enn TEXT_SIMILARITY_THRESHOLD fordi tallene også er like.
 */
export const SAME_NUMBERS_SIMILARITY = 0.3

/** Tallene i en tekst, sortert («1 004» er ett tall). */
const numbersIn = (text: string) =>
  (text.replace(/(\d) (?=\d{3}\b)/g, '$1').match(/\d+/g) ?? []).map(Number).sort((a, b) => a - b).join(',')

/** Samme oppgave med ubetydelig endret formulering: samme tall, og enten minst to tall eller nesten lik ordlyd. */
export function isNearDuplicate(a: string, b: string) {
  const numbers = numbersIn(a)
  if (numbers !== numbersIn(b)) return false
  return numbers.split(',').filter(Boolean).length >= 2 || textSimilarity(a, b) >= NEAR_DUPLICATE_THRESHOLD
}

type GeneralRequest = Extract<TaskRequest, { kind: 'general' }>

/** Hvorfor en AI-oppgave ble tatt bort. */
export type RemovalReason =
  | 'format'
  | 'duplicateInResponse'
  | 'duplicateInSet'
  | 'swappedFactors'
  | 'outsideTables'
  | 'invalidStrategy'
  | 'copiedReference'
  | 'nearDuplicate'
  | 'offTopic'
  | 'wrongArea'
  | 'wrongSolution'
  | 'levelMismatch'
  | 'missingCarry'
  | 'internalText'
  | 'wrongConclusion'
  | 'unclearSolution'
  | 'divisionByZero'
  | 'wrongDivisionType'
  | 'wrongRemainder'
  | 'missingModel'
  | 'missingRelation'
  | 'missingFigure'
  | 'wrongAngle'
  | 'wrongFact'
  | 'wrongTerm'
  | 'invalidVisual'
  | 'irrelevantVisual'
  | 'drawingTask'
  | 'visualMismatch'
  | 'figureRequired'
  | 'wrongOperation'
  | 'missingSteps'
  | 'missingInfo'
  | 'invalidOptions'
  | 'outsideRange'
  | 'revealedSolution'
  | 'decimalFormat'
  | 'tooManyDecimals'
  | 'wrongConversion'
  | 'missingUnit'
  | 'foreignUnit'
  | 'wrongAreaUnit'
  | 'wrongTime'
  | 'unreasonableValue'

export interface GeneralCheck {
  result: TaskResult
  /** Beskjed til læreren når oppgaver er tatt bort eller resultatet er ufullstendig. */
  warning?: string
  /** Tekniske funn til serverloggen (uten oppgavetekst). */
  issues: string[]
  /** Antall oppgaver tatt bort per årsak. */
  removed: Record<RemovalReason, number>
}

const isMathType = (type: string) => type === 'Hoderegning' || type === 'Oppstilling'

/** Nivået består av korte regnestykker: oppgavesettet når det er oppsummert, ellers referansene. */
function isShortMathLevel(level?: AiLevelContext) {
  if (!level) return false
  if (level.existing?.length) return level.existing.every((t) => isMathType(t.taskType))
  return level.referenceTasks.length > 0 && level.referenceTasks.every((r) => isMathType(r.taskType))
}

/** Lang tekstoppgave eller flere delspørsmål: to spørsmålstegn, «a)»/«b)» eller lang tekst. */
export function isLongOrMultiPart(text: string) {
  return (text.match(/\?/g)?.length ?? 0) >= 2 || /(^|\n|\s)[a-dA-D]\)\s/.test(text) || text.length > 180
}

/** Gangestykke uten noen av gangetabellene på nivået. */
const outsideTables = (task: AiTaskDraft, factors?: number[]) =>
  !!factors && isMathDraft(task) && task.operator === '*' && !factors.includes(task.a) && !factors.includes(task.b)

// ---------------------------------------------------------------------------------------------
// Like oppgaver. Samme matematiske faktum er lov når formatet, representasjonen eller den faglige
// hensikten er forskjellig – derfor er oppgavetype, figur og instruksjonens hensikt med i nøkkelen.

/** Små bokstaver, likt gangetegn, uten tegnsetting og doble mellomrom. */
export function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/(\d)\s*[x×*]\s*(?=\d)/g, '$1 · ')
    .replace(/[.,!?;:«»"'()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Instruksjoner som bare ber eleven regne ut, har samme hensikt. */
const PLAIN_INSTRUCTION = /^(regn ut|hva er|hvor mye er|finn svaret|regn|gang|svar)$/

const instructionPurpose = (instruction: string) => {
  const text = normalizeText(instruction)
  return PLAIN_INSTRUCTION.test(text) ? 'regn ut' : text
}

interface Fact {
  taskType: string
  instruction: string
  a: number
  operator: AiOperator
  b: number
}

const factKey = (level: AiLevel, f: Fact, swapped: boolean) => {
  // Byttede faktorer (·) og byttede ledd (+) gir samme oppgave.
  const [a, b] = swapped && (f.operator === '*' || f.operator === '+') ? [Math.min(f.a, f.b), Math.max(f.a, f.b)] : [f.a, f.b]
  return `${level}|regnestykke|${f.taskType}|${instructionPurpose(f.instruction)}|${a}${f.operator}${b}`
}

/** Tekstoppgaver: teksten og eventuell figur. En plan figur eller vinkel er med i nøkkelen (samme tekst, annen figur = annen oppgave). */
const textKey = (level: AiLevel, text: string, figure: boolean | string = false) =>
  `${level}|tekst|${typeof figure === 'string' ? figure : figure ? 'figur' : ''}|${normalizeText(text)}`

/** Nøklene til en oppgave: eksakt, og med faktorene sortert (byttede faktorer). */
function keysOf(level: AiLevel, task: AiTaskDraft | AiExistingTask) {
  if ('format' in task && isMathDraft(task)) {
    return { exact: factKey(level, task, false), swapped: factKey(level, task, true) }
  }
  if ('operator' in task && task.operator && task.a !== undefined && task.b !== undefined) {
    const fact = { taskType: task.taskType, instruction: task.instruction ?? '', a: task.a, operator: task.operator, b: task.b }
    return { exact: factKey(level, fact, false), swapped: factKey(level, fact, true) }
  }
  const text = 'studentText' in task ? task.studentText : (task.text ?? '')
  const figure =
    'studentText' in task ? visualSignature(task.figure) || false : (task as AiExistingTask).figureKind || (task as AiExistingTask).figure === true
  const key = textKey(level, text, figure)
  return { exact: key, swapped: key }
}

// ---------------------------------------------------------------------------------------------
// Likhet med referansenes formulering: ordpar etter at tallene er maskert, Dice-koeffisient.

function wordPairs(text: string) {
  const merged = text.replace(/(\d) (?=\d{3}\b)/g, '$1')
  const words = normalizeText(merged.replace(/\d+/g, '#')).split(' ').filter(Boolean)
  if (words.length < 2) return words
  return words.slice(1).map((word, i) => `${words[i]} ${word}`)
}

/** Hvor lik formuleringen i to tekster er (0–1), uten å regne med tallene. */
export function textSimilarity(a: string, b: string) {
  const pa = wordPairs(a)
  const pb = wordPairs(b)
  if (pa.length === 0 || pb.length === 0) return 0
  const counts = new Map<string, number>()
  for (const pair of pb) counts.set(pair, (counts.get(pair) ?? 0) + 1)
  let shared = 0
  for (const pair of pa) {
    const left = counts.get(pair) ?? 0
    if (left > 0) {
      shared++
      counts.set(pair, left - 1)
    }
  }
  return (2 * shared) / (pa.length + pb.length)
}

// ---------------------------------------------------------------------------------------------

const REMOVAL_TEXT: Record<RemovalReason, string> = {
  format: 'ikke passet formatet i oppgavesettet',
  duplicateInResponse: 'var like en annen oppgave i samme svar',
  duplicateInSet: 'var like en oppgave som allerede finnes',
  swappedFactors: 'bare hadde byttet om faktorene i en oppgave som allerede finnes',
  outsideTables: 'brukte gangetabeller utenfor økta',
  invalidStrategy: 'hadde en strategi som ikke passet regnestykket',
  nearDuplicate: 'bare hadde endret formuleringen litt i en oppgave som allerede finnes',
  offTopic: 'ikke passet målet for økta',
  wrongArea: 'hørte til et annet fagområde enn økta',
  wrongSolution: 'hadde feil fasit',
  levelMismatch: 'ikke passet støttestrukturen på nivået',
  missingCarry: 'ikke krevde addisjon med tierovergang',
  internalText: 'inneholdt intern systemtekst',
  wrongConclusion: 'hadde feil konklusjon eller utregning i en oppgave der eleven skal vurdere en påstand',
  unclearSolution: 'hadde et uklart eller selvmotsigende løsningsforslag',
  copiedReference: 'kopierte formuleringen i en referanseoppgave',
  divisionByZero: 'delte på 0',
  wrongDivisionType: 'viste en annen divisjonstype enn økta, eller der tekst og fasit ikke var enige om typen',
  wrongRemainder: 'brukte rest feil for økta eller situasjonen',
  missingModel: 'ikke ba eleven bruke eller tolke en modell',
  missingRelation: 'ikke viste sammenhengen mellom multiplikasjon og divisjon',
  missingFigure: 'viste til en figur eller et bilde som ikke vises',
  wrongAngle: 'hadde feil vinkeltype eller feil gradtall',
  wrongFact: 'hadde feil fakta om en figur, en romfigur eller et nett',
  wrongTerm: 'brukte feil geometriske begreper (sider, kanter og flater)',
  invalidVisual: 'hadde en figur appen ikke kan tegne',
  irrelevantVisual: 'hadde en figur som ikke hører til økta',
  drawingTask: 'ba eleven tegne, noe elevvisningen ikke støtter',
  visualMismatch: 'hadde en tekst eller fasit som ikke stemte med figuren',
  figureRequired: 'manglet figuren oppgavene i området skal ha, eller viste ikke til den',
  wrongOperation: 'brukte en regneart som ikke passet handlingen i fortellingen',
  missingSteps: 'ikke krevde minst to regnesteg, eller ikke viste stegene i løsningen',
  missingInfo: 'manglet opplysninger som trengs for å løse oppgaven',
  invalidOptions: 'hadde ugyldige svaralternativer (ikke nøyaktig ett riktig, like alternativer, tilfeldige gale svar eller en fasit som ikke stemte med alternativene)',
  outsideRange: 'brukte tall utenfor tallområdet på nivået',
  revealedSolution: 'avslørte svaret i oppgaveteksten',
  decimalFormat: 'skrev desimaltall med punktum i stedet for komma',
  tooManyDecimals: 'brukte hundredeler eller flere desimaler',
  wrongConversion: 'hadde feil omgjøring mellom måleenheter, eller sammenlignet størrelser uten å gjøre dem om til samme enhet',
  missingUnit: 'manglet enhet i fasiten',
  foreignUnit: 'brukte en måleenhet som ikke hører til økta',
  wrongAreaUnit: 'blandet areal og omkrets (areal i lengdeenhet, omkrets i kvadratenhet eller kvadratenhet skrevet uten ²)',
  wrongTime: 'regnet feil med tid (f.eks. som om en time har 100 minutter), eller hadde et ugyldig eller tvetydig klokkeslett',
  unreasonableValue: 'hadde en vekt som ikke er rimelig for tingen som veies',
}

const emptyRemoved = (): Record<RemovalReason, number> => ({
  format: 0,
  duplicateInResponse: 0,
  duplicateInSet: 0,
  swappedFactors: 0,
  outsideTables: 0,
  invalidStrategy: 0,
  copiedReference: 0,
  nearDuplicate: 0,
  offTopic: 0,
  wrongArea: 0,
  wrongSolution: 0,
  levelMismatch: 0,
  missingCarry: 0,
  internalText: 0,
  wrongConclusion: 0,
  unclearSolution: 0,
  divisionByZero: 0,
  wrongDivisionType: 0,
  wrongRemainder: 0,
  missingModel: 0,
  missingRelation: 0,
  missingFigure: 0,
  wrongAngle: 0,
  wrongFact: 0,
  wrongTerm: 0,
  invalidVisual: 0,
  irrelevantVisual: 0,
  drawingTask: 0,
  visualMismatch: 0,
  figureRequired: 0,
  wrongOperation: 0,
  missingSteps: 0,
  missingInfo: 0,
  invalidOptions: 0,
  outsideRange: 0,
  revealedSolution: 0,
  decimalFormat: 0,
  tooManyDecimals: 0,
  wrongConversion: 0,
  missingUnit: 0,
  foreignUnit: 0,
  wrongAreaUnit: 0,
  wrongTime: 0,
  unreasonableValue: 0,
})

/** «Tatt bort: 2 som var like …, 1 som …» – eller tom streng. */
function removalSentence(removed: Record<RemovalReason, number>) {
  const parts = (Object.keys(removed) as RemovalReason[]).filter((r) => removed[r] > 0).map((r) => `${removed[r]} som ${REMOVAL_TEXT[r]}`)
  if (parts.length === 0) return ''
  const total = Object.values(removed).reduce((a, b) => a + b, 0)
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} og ${parts.at(-1)}` : parts[0]
  return `${total} ${total === 1 ? 'oppgave' : 'oppgaver'} ble tatt bort: ${list}.`
}

/** Regneartene i øktprofilen («addisjon (+)» → '+'). Tom når profilen ikke sier noe. */
function sessionOperators(operations: string[] = []): Set<AiOperator> {
  const symbols: [string, AiOperator][] = [['(+)', '+'], ['(−)', '-'], ['(·)', '*'], ['(:)', '/']]
  return new Set(operations.flatMap((op) => symbols.filter(([mark]) => op.includes(mark)).map(([, symbol]) => symbol)))
}

/** Avrunding – men ikke «fyll opp til nærmeste tier», som er en addisjonsstrategi. */
const ROUNDING = /\b(rund(e|er)? av|avrund\w*)|(?<!opp til )nærmeste (hele )?(tier|hundrer|tusen)/i
const NEGATIVE_NUMBER = /(^|[\s(:])[-−]\s?\d|kuldegrad|minusgrad|under null|minus \d|under bakken/i
const ERROR_ANALYSIS = /\b(har \w+ rett|finn feilen|stemmer det|sier at|hevder|skrev|skriver)\b/i
const FOUR_DIGITS = /\d{4,}|\d \d{3}\b/

const studentTextOf = (task: AiTaskDraft) => (isMathDraft(task) ? task.instruction : task.studentText)

/**
 * Om oppgaven hører til fagområdet (Tall og plassverdi). Negative tall kan bare lages som tekst
 * (appens regnestykker har ikke negative svar), og oppstilling over 1000 må ha minst ett firesifret tall.
 */
function areaProblem(area: ReferenceArea, task: AiTaskDraft): boolean {
  if (area === 'negative-tall') return isMathDraft(task) || !NEGATIVE_NUMBER.test(task.studentText)
  if (area === 'oppstilling-over-1000') {
    if (isMathDraft(task)) return !['+', '-'].includes(task.operator) || Math.max(task.a, task.b) < 1000
    return !FOUR_DIGITS.test(task.studentText)
  }
  return false
}

/** Minst fem ord (ikke tall eller tegn): teksten har en formulering som kan kopieres. */
const hasWording = (text: string) => (text.match(/\p{L}{2,}/gu)?.length ?? 0) >= 5

/** Regnestykkene i en referanse, f.eks. «243+126» (mellomrom i tall slått sammen). */
function referenceFacts(text: string) {
  const merged = text.replace(/(\d) (?=\d{3}\b)/g, '$1').replace(/[×x·*]/g, '*').replace(/−/g, '-').replace(/:/g, '/')
  return new Set([...merged.matchAll(/(\d+)\s*([+\-*/])\s*(\d+)/g)].map(([, a, op, b]) => `${a}${op}${b}`))
}

/** Problemløsing: eleven vurderer en løsning der feilen i oppgaveteksten er meningen («Emil regner slik: …», «Hvem har tenkt riktig?»). */
const SOLUTION_REVIEW = /gjort feil|har (\p{L}+ )?glemt|tenkt (riktig|feil)|regner slik|riktig løsning|er modellen riktig|hvilke påstander/iu

/** Fasiten i en tekstoppgave stemmer ikke med regnestykkene i den (feilanalyser og vurderingsoppgaver: bare fasiten kontrolleres). */
function solutionProblem(task: AiTaskDraft, problemSolving = false) {
  if (isMathDraft(task)) return false
  const review = problemSolving && SOLUTION_REVIEW.test(task.studentText)
  const format = review || ERROR_ANALYSIS.test(task.studentText) || ASSESSMENT.test(task.studentText) ? 'Feilanalyse' : ''
  return checkReferenceMath({ studentText: task.studentText, solution: task.solution, format }).errors.length > 0
}

// ---------------------------------------------------------------------------------------------
// Tierovergang: minst én nødvendig addisjon må ha veksling i en plassverdi.

/**
 * Om a + b krever veksling: en kolonne der sifrene til sammen blir 10 eller mer. Den første
 * vekslingen kan bare komme fra en slik kolonne, så det er nok å se på sifrene parvis.
 */
export function additionHasCarry(a: number, b: number): boolean {
  for (let x = Math.abs(a), y = Math.abs(b); x > 0 || y > 0; x = Math.floor(x / 10), y = Math.floor(y / 10)) {
    if ((x % 10) + (y % 10) >= 10) return true
  }
  return false
}

const mergeThousands = (text: string) => text.replace(/(\d) (?=\d{3}\b)/g, '$1').replace(/−/g, '-')
const numbersOf = (text: string) => (mergeThousands(text).match(/\d+/g) ?? []).map(Number)

/** Addisjonene som står skrevet i teksten: «a + b» og kjeder som «a + b + c» (summert fra venstre). */
function writtenAdditions(text: string): [number, number][] {
  const pairs: [number, number][] = []
  for (const [chain] of mergeThousands(text).matchAll(/\d+(?:\s*\+\s*\d+)+/g)) {
    const terms = chain.split('+').map((t) => Number(t.trim()))
    let sum = terms[0]
    for (const term of terms.slice(1)) {
      pairs.push([sum, term])
      sum += term
    }
  }
  return pairs
}

/**
 * Om oppgaven krever minst én addisjon med veksling. Ikke ordsøk, men regning:
 * - regnestykker: a + b med veksling (subtraksjon alene teller ikke)
 * - tekstoppgaver: en skrevet addisjon i oppgaven eller fasiten (tomme felt fylt med fasiten) med
 *   veksling, eller to tall i oppgaven med veksling der summen er svaret – eventuelt etter ett
 *   regnetrinn til med et tredje tall i oppgaven (flertrinnsoppgaver uten skrevet utregning)
 */
export function requiresCarry(task: AiTaskDraft): boolean {
  if (isMathDraft(task)) return task.operator === '+' && additionHasCarry(task.a, task.b)
  const answers = numbersOf(task.solution)
  let filled = task.studentText
  if (/__+/.test(filled) && answers.length > 0) {
    let i = 0
    filled = filled.replace(/__+/g, () => String(answers[Math.min(i++, answers.length - 1)]))
  }
  if ([...writtenAdditions(filled), ...writtenAdditions(task.solution)].some(([a, b]) => additionHasCarry(a, b))) return true
  const given = numbersOf(task.studentText)
  const results = new Set(answers)
  for (let i = 0; i < given.length; i++) {
    for (let j = i + 1; j < given.length; j++) {
      if (!additionHasCarry(given[i], given[j])) continue
      const sum = given[i] + given[j]
      if (results.has(sum)) return true
      const others = given.filter((_, k) => k !== i && k !== j)
      if (others.some((z) => results.has(sum + z) || results.has(sum - z))) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------------------------
// Intern systemtekst: hører hjemme i serverloggen, aldri i synlige felt.

const INTERNAL_TEXT =
  /reserve\s?(kandidat|oppgave)\w*|utfyllings?(forsøk|runde)\w*|\brefill\w*|\bfallback\w*|reservemodell\w*|\bprompt\w*|referanse[- ]?(id|oppgave)\w*|\b(?:[MTDGP]|TR|MA)\d-N\d-\d{2}\b|\bkandidat(en|er|ene|nummer|nr)?\b/i

/** Om teksten inneholder interne ord eller ID-er (reservekandidat, utfyllingsforsøk, prompt, M4-N2-01, D3-N2-01, P2-N1-03, TR2-N2-01, MA4-N2-01 …). */
export const containsInternalText = (text: string) => INTERNAL_TEXT.test(text)

/** Teksten uten setningene som inneholder interne ord. */
export function stripInternalText(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !containsInternalText(sentence))
    .join(' ')
    .trim()
}

// ---------------------------------------------------------------------------------------------
// Vurderingsoppgaver («Har Jonas rett?»): oppgaveteksten har en påstand som kan være bevisst feil.
// Løsningsforslaget må gi én entydig, riktig konklusjon og riktig utregning.

/** Eleven skal vurdere en påstand: «Har Jonas rett?», «Stemmer det?», «Er regnestykket riktig?» … */
const ASSESSMENT = /har \p{L}+ rett|stemmer (det|dette|svaret|utregningen|påstanden)|\ber\b[^.?!]{0,40}\briktig\b(?=[^.!]*\?)/iu
/** Synlig nøling eller selvkorrigering fra modellen. */
const HESITATION = /\b(vent|hmm|oi|unnskyld|jeg mente|jeg regner på nytt|rettelse|korrigering)\b/i
/** Navnealternativer som «Mina/Jonas». */
const NAME_ALTERNATIVE = /\b\p{Lu}\p{Ll}+\s?\/\s?\p{Lu}\p{Ll}+/u

/**
 * Påstanden i oppgaveteksten (mellomrom i tall slått sammen), eller null: tallet noen mener mangler i et regnestykke
 * med et tomt felt («__ − 27 = 40 … sier at tallet er 13»), ellers det første «a op b = c».
 */
function claimIn(text: string) {
  const normalized = mergeThousands(text).replace(/[×x·*]/g, '*')
  const blank = /(?:_{2,}|□)\s*([+\-*:/])\s*(\d+)\s*=\s*(\d+)/.exec(normalized)
  const said = /\b(?:tallet|svaret|det) er (\d+)/i.exec(normalized)
  if (blank && said) {
    // __ op b = c: tallet som mangler er c + b, c − b, c : b eller c · b.
    const [op, b, c] = [blank[1], Number(blank[2]), Number(blank[3])]
    const value = op === '+' ? c - b : op === '-' ? c + b : op === '*' ? (b === 0 ? NaN : c / b) : c * b
    return { value, claimed: Number(said[1]) }
  }
  const m = /(\d+)\s*([+\-*:/])\s*(\d+)\s*=\s*(\d+)/.exec(normalized)
  if (!m) return null
  const [a, op, b, claimed] = [Number(m[1]), m[2], Number(m[3]), Number(m[4])]
  const value = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : b === 0 ? NaN : a / b
  return { value, claimed }
}

/**
 * Kontrollerer løsningsforslaget i tekstoppgaver:
 * - aldri nøling, selvkorrigering eller navnealternativer («Nei, vent», «Mina/Jonas») → uklart
 * - i vurderingsoppgaver: løsningen starter med «Ja» eller «Nei», har bare én av dem og ingen
 *   spørsmål, påstanden «a op b = c» i oppgaveteksten regnes ut, og konklusjonen må stemme
 *   (ja når påstanden er riktig, nei når den er feil); utregningene i løsningen må være riktige,
 *   og det riktige svaret må stå der. Kan påstanden ikke leses, kan svaret ikke kontrolleres → uklart.
 * Den bevisste feilen i oppgaveteksten er lov – det er løsningen som må identifisere den.
 */
export function assessmentProblem(
  task: AiTaskDraft,
  { verbalClaims = false, measureClaims = false }: { verbalClaims?: boolean; measureClaims?: boolean } = {},
): 'wrongConclusion' | 'unclearSolution' | null {
  if (isMathDraft(task)) return null
  const { solution } = task
  if (HESITATION.test(solution) || NAME_ALTERNATIVE.test(solution)) return 'unclearSolution'
  if (!ASSESSMENT.test(task.studentText)) return null
  if (solution.includes('?')) return 'unclearSolution'
  const answers = new Set(solution.toLowerCase().match(/\b(ja|nei)\b/g) ?? [])
  if (answers.size > 1) return 'unclearSolution'
  const conclusion = /^\s*(ja|nei)\b/i.exec(solution)?.[1].toLowerCase()
  if (!conclusion) return 'unclearSolution'
  // Måling: påstanden har enheter eller klokkeslett («1130 − 1040 = 90» er ikke 90 minutter) og regnes ut i measurementChecks.ts.
  if (measureClaims) return null
  const claim = claimIn(task.studentText)
  // Påstander i ord («Alle kvadrater er rektangler») kan ikke regnes ut. I Geometri er de vanlige: da kreves
  // bare én entydig ja/nei-konklusjon – fagkontrollene og prompten tar resten.
  if (!claim) return verbalClaims ? null : 'unclearSolution'
  const claimIsTrue = claim.value === claim.claimed
  if ((conclusion === 'ja') !== claimIsTrue) return 'wrongConclusion'
  if (checkEquations(solution).errors.length > 0) return 'wrongConclusion'
  if (!Number.isInteger(claim.value) || !numbersOf(solution).includes(claim.value)) return 'wrongConclusion'
  return null
}

export interface CandidateCheck {
  /** Kandidatene som besto kontrollene, i samme rekkefølge som i svaret. */
  accepted: AiTaskDraft[]
  /** Kandidatene som ble tatt bort, med årsak (brukes til å blokkere dem ved utfylling). */
  rejected: { task: AiTaskDraft; reason: RemovalReason }[]
  removed: Record<RemovalReason, number>
  /** Tekniske funn til serverloggen (uten oppgavetekst). */
  issues: string[]
}

/**
 * Kjører kvalitetskontrollene på AI-kandidater:
 * - kompetansemål tømmes når læreren ikke oppga offisiell måltekst
 * - på nivåer med korte regnestykker tas lange tekstoppgaver og oppgaver med flere delspørsmål
 *   bort – med mindre læreren har skrevet egne ønsker (da kan læreren ha bedt om dem)
 * - med fagområde (multiplikasjon, Tall og plassverdi, Divisjon) i tillegg:
 *   - like oppgaver i svaret, blant tidligere godkjente kandidater (`accepted`) og i oppgavesettet
 *     tas bort; byttede faktorer regnes som like, med mindre øktprofilen tillater dem
 *   - gangestykker utenfor øktas gangetabeller tas bort når læreren ikke har skrevet egne ønsker
 *   - regneart, deltema (avrunding), fagområde og nivå kontrolleres alltid – også med «Andre ønsker»
 *   - «Andre ønsker» kan bare gjøre formatkontrollen (lange tekstoppgaver) fleksibel
 *   - regnestykker med en strategi som ikke passer stykket (f.eks. «10-gangen minus én gruppe» til 8 · 7) tas bort
 *   - tekstoppgaver som er svært like en referanses formulering tas bort (i Divisjon også med samme tall)
 *   - Geometri: figur som ikke vises, areal og omkrets, fagområdet, vinkeltyper og gradtall, fakta om
 *     figurer, romfigurer og nett (se geometryChecks.ts)
 *   - Divisjon: divisjon på 0, tallområdet, fasit og rest (også når svaret må rundes opp), divisjonstype,
 *     sammenheng med gange og modeller (se divisionChecks.ts)
 *   - Problemløsing: regneuttrykk og regneart, modeller, flere steg og manglende opplysninger, avrunding
 *     oppover, svaralternativer, tallområdet og nivået (se problemSolvingChecks.ts)
 *   - Tall og regning: sammenhengen mellom regneartene og regnefamilier (samme kontroll som i Divisjon), rest,
 *     desimaltall med komma og én desimal, tideler, sammenligninger, lengder og enheter (se numbersAndOperationsChecks.ts).
 *     Sammenhengen mellom gange og dele sammenlignes også med referansene i divisjonsbanken (kopier).
 *   - Måling: enheter som hører til økta, enhet i svaret, omgjøringer (L og dL, kg og g, timer og minutter), regnestykker
 *     med enheter og klokkeslett, desimaltall med én desimal i liter og kilogram, terninger, areal og omkrets av rektangler,
 *     tidsintervaller og rimelig vekt (se measurementChecks.ts). Kopier sammenlignes også med Tall og regning og Geometri.
 * - uten fagområde logges gangestykker utenfor øktas tabeller (som før)
 * Kontrollene er de samme for første generering og for utfylling.
 */
export function checkCandidates(candidates: AiTaskDraft[], request: GeneralRequest, accepted: AiTaskDraft[] = []): CandidateCheck {
  const { officialGoals = '', wishes = '', levels = [], profile } = request
  const issues: string[] = []
  const removed = emptyRemoved()
  const rejected: CandidateCheck['rejected'] = []
  const hasWishes = wishes.trim().length > 0
  const area = profile?.area
  let tasks = candidates
  const levelInfo = (level: AiLevel) => levels.find((l) => l.level === level)
  const factorsOf = (level: AiLevel) => levelInfo(level)?.factors ?? profile?.factors

  if (!officialGoals.trim() && tasks.some((t) => t.competenceGoal)) {
    issues.push('kompetansemål uten oppgitt måltekst ble tømt')
    tasks = tasks.map((t) => ({ ...t, competenceGoal: '' }))
  }

  const remove = (task: AiTaskDraft, reason: RemovalReason) => {
    removed[reason]++
    rejected.push({ task, reason })
    return false
  }

  // Tilpasning og kompetansemål: interne setninger tas bort. Står det ingenting igjen, beskrives nivået.
  tasks = tasks.map((t) => {
    if (!containsInternalText(t.adaptation) && !containsInternalText(t.competenceGoal)) return t
    issues.push('intern tekst fjernet fra tilpasning')
    const info = levelInfo(t.level)
    const adaptation = stripInternalText(t.adaptation) || `Nivå ${t.level}: ${info?.description || info?.support || 'tilpasset nivået i økta.'}`
    return { ...t, adaptation, competenceGoal: stripInternalText(t.competenceGoal) }
  })
  // Oppgavetekst, instruksjon og fasit med interne ord leveres ikke (de erstattes gjennom utfyllingen).
  tasks = tasks.filter((t) => !containsInternalText(isMathDraft(t) ? t.instruction : `${t.studentText} ${t.solution}`) || remove(t, 'internalText'))
  // Figurer: bare gyldige figurer, bare i geometriøkter der de hører hjemme, ingen tegneoppgaver i Geometri,
  // og tekst og fasit må stemme med figuren (alle økter – også med «Andre ønsker»).
  tasks = tasks.filter((t) => {
    const problem = visualProblem(t, { area: profile?.area })
    return !problem || remove(t, problem)
  })
  // Løsningsforslaget må være entydig, og ja/nei i vurderingsoppgaver må stemme (alle økter).
  // Geometri, Problemløsing og Tall og regning har påstander i ord («Er modellen riktig?», «1,3 er mindre enn 0,9»):
  // da kreves én entydig ja/nei-konklusjon (påstander om desimaltall og lengder kontrolleres i numbersAndOperationsChecks.ts).
  const verbalClaims = !!profile?.area && ['geometri', 'problemlosing', 'tall-og-regning', 'maling'].includes(topicOfArea(profile.area))
  const measureClaims = !!profile?.area && topicOfArea(profile.area) === 'maling'
  tasks = tasks.filter((t) => {
    const problem = assessmentProblem(t, { verbalClaims, measureClaims })
    return !problem || remove(t, problem)
  })

  if (!hasWishes) {
    tasks = tasks.filter((t) => !(isShortMathLevel(levelInfo(t.level)) && !isMathDraft(t) && isLongOrMultiPart(t.studentText)) || remove(t, 'format'))
  }

  if (area) {
    const allowSwapped = profile?.allowSwappedFactors === true
    const inSet = new Map<string, 'exact' | 'swapped'>()
    for (const level of levels) {
      for (const task of level.existing ?? []) {
        const keys = keysOf(level.level, task)
        inSet.set(keys.exact, 'exact')
        if (!allowSwapped && !inSet.has(keys.swapped)) inSet.set(keys.swapped, 'swapped')
      }
    }
    // Tidligere godkjente kandidater (fra første generering) teller som en del av svaret.
    const inResponse = new Set<string>()
    for (const task of accepted) {
      const keys = keysOf(task.level, task)
      inResponse.add(keys.exact)
      inResponse.add(keys.swapped)
    }
    const topic = topicOfArea(area)
    const multiplication = topic === 'multiplikasjon'
    const placeValue = topic === 'tall-og-plassverdi'
    const division = topic === 'divisjon'
    const geometry = topic === 'geometri'
    const problemSolving = topic === 'problemlosing'
    const numbersAndOperations = topic === 'tall-og-regning'
    const measurement = topic === 'maling'
    const numbersContext = numbersAndOperations
      ? {
          area: area as NumbersAndOperationsArea,
          secondaryAreas: (profile?.secondaryAreas ?? []).filter((a): a is NumbersAndOperationsArea => isReferenceArea(a) && topicOfArea(a) === 'tall-og-regning'),
        }
      : null
    const problemSolvingContext = problemSolving
      ? {
          area: area as ProblemSolvingArea,
          secondaryAreas: (profile?.secondaryAreas ?? []).filter((a): a is ProblemSolvingArea => isReferenceArea(a) && topicOfArea(a) === 'problemlosing'),
        }
      : null
    const geometryContext = geometry
      ? {
          area: area as GeometryArea,
          secondaryAreas: (profile?.secondaryAreas ?? []).filter((a): a is GeometryArea => isReferenceArea(a) && topicOfArea(a) === 'geometri'),
        }
      : null
    const divisionContext = division
      ? {
          area: area as DivisionArea,
          secondaryAreas: (profile?.secondaryAreas ?? []).filter((a): a is DivisionArea => isReferenceArea(a) && topicOfArea(a) === 'divisjon'),
          divisionType: profile?.divisionType,
          // «Andre ønsker» kan skjerpe kravet til situasjonen (alle skal få plass), men aldri slippe opp en kontroll.
          roundUpRequired: wishRequiresRoundUp(wishes),
        }
      : null
    const operators = sessionOperators(profile?.operations)
    // Tekstene som finnes på nivået (oppgavesettet og godkjente kandidater), til kontrollen av nesten like oppgaver.
    // Tekster med figur sammenlignes bare med tekster med samme figur (samme spørsmål til en annen figur er en ny oppgave).
    const textsOn = new Map<AiLevel, { text: string; figure: string }[]>()
    const addText = (level: AiLevel, text: string, figure = '') => textsOn.set(level, [...(textsOn.get(level) ?? []), { text, figure }])
    for (const level of levels) {
      for (const task of level.existing ?? []) if (task.text && (!task.figure || task.figureKind)) addText(level.level, task.text, task.figureKind ?? '')
    }
    for (const task of accepted) if (!isMathDraft(task)) addText(task.level, task.studentText, visualSignature(task.figure))

    tasks = tasks.filter((task) => {
      const keys = keysOf(task.level, task)
      if (inResponse.has(keys.exact) || (!allowSwapped && inResponse.has(keys.swapped))) return remove(task, 'duplicateInResponse')
      if (inSet.get(keys.exact) === 'exact') return remove(task, 'duplicateInSet')
      if (!allowSwapped && inSet.has(keys.swapped)) return remove(task, 'swappedFactors')
      if (
        !isMathDraft(task) &&
        (textsOn.get(task.level) ?? []).some((t) => t.figure === visualSignature(task.figure) && isNearDuplicate(task.studentText, t.text))
      ) {
        return remove(task, 'nearDuplicate')
      }
      // Faglige kontroller – gjelder alltid, også når læreren har skrevet «Andre ønsker». Ønskene kan
      // endre kontekst, formulering, svarform og format, men ikke målet, området eller nivået i økta.
      // Målet for økta: regnearter i profilen, og ikke avrunding i Tall og plassverdi (ikke med i temaet).
      if (isMathDraft(task) && operators.size > 0 && !operators.has(task.operator)) return remove(task, 'offTopic')
      if (placeValue && ROUNDING.test(studentTextOf(task))) return remove(task, 'offTopic')
      if (placeValue && areaProblem(area, task)) return remove(task, 'wrongArea')
      // Divisjon: divisjon på 0, tallområdet, fasit og rest, divisjonstype, sammenheng med gange og modeller.
      if (divisionContext) {
        const problem = divisionProblem(task, divisionContext)
        if (problem) return remove(task, problem)
      }
      // Geometri: figurer som ikke vises, deltema utenfor økta, fagområdet, vinkler og figurfakta.
      if (geometryContext) {
        const problem = geometryProblem(task, geometryContext)
        if (problem) return remove(task, problem)
      }
      // Problemløsing: format, tallområde, figurer og modeller, nivå, svaralternativer, regnesteg, regneart og
      // avrunding oppover (se problemSolvingChecks.ts). Synlig nøling i oppgaveteksten avvises også.
      if (problemSolvingContext) {
        if (!isMathDraft(task) && HESITATION.test(task.studentText)) return remove(task, 'unclearSolution')
        const problem = problemSolvingProblem(task, problemSolvingContext)
        if (problem) return remove(task, problem)
      }
      // Tall og regning: sammenhengen mellom regneartene, regnefamilier, rest, desimaltall med komma og én desimal,
      // tideler, sammenligninger, omgjøring av lengder og enheter (se numbersAndOperationsChecks.ts).
      if (numbersContext) {
        if (!isMathDraft(task) && HESITATION.test(task.studentText)) return remove(task, 'unclearSolution')
        const problem = numbersProblem(task, numbersContext)
        if (problem) return remove(task, problem)
      }
      // Måling: enheter og omgjøringer, desimaltall i liter og kilogram, terninger, areal og omkrets, tid og
      // rimelig vekt (se measurementChecks.ts). Synlig nøling i oppgaveteksten avvises også.
      if (measurement) {
        if (!isMathDraft(task) && HESITATION.test(task.studentText)) return remove(task, 'unclearSolution')
        const problem = measurementProblem(task, { area: area as MeasurementArea })
        if (problem) return remove(task, problem)
      }
      // Økter der tierovergang er det uttrykkelige målet: minst én addisjon med veksling.
      if (profile?.requiresCarry && !requiresCarry(task)) return remove(task, 'missingCarry')
      if (!hasWishes && outsideTables(task, factorsOf(task.level))) return remove(task, 'outsideTables')
      // En strategi i instruksjonen må passe akkurat dette regnestykket – også når læreren har ønsker.
      if (isMathDraft(task) && strategyProblem(task.instruction, task.a, task.b)) return remove(task, 'invalidStrategy')
      if (solutionProblem(task, problemSolving)) return remove(task, 'wrongSolution')
      // Sammenhengen mellom gange og dele i Tall og regning overlapper med Divisjon: kandidaten må heller ikke kopiere
      // en referanse om multiplikasjon og divisjon i divisjonsbanken.
      const references = [
        ...(levelInfo(task.level)?.referenceTasks ?? []),
        ...(area === 'sammenheng-multiplikasjon-divisjon' ? divisionReferences.filter((r) => r.area === 'multiplikasjon-divisjon') : []),
        // Måling overlapper med Tall og regning (desimaltall og lengdemåling) og Geometri (areal og omkrets):
        // kandidaten må heller ikke kopiere de referansene.
        ...(measurement
          ? [...numbersAndOperationsReferences.filter((r) => r.area === 'desimaltall-tideler' || r.area === 'desimaltall-lengde'), ...geometryReferences.filter(isAreaOrPerimeterReference)]
          : []),
      ]
      // Figuroppgaver som spør om «figuren» eller «vinkelen» har innholdet i figuren appen tegner, ikke i teksten:
      // et kort spørsmål som «Hvor mange sider har figuren?» er ikke en kopi av en referanse uten figur.
      const figureCarriesContent = !isMathDraft(task) && !!task.figure && /\b(figuren|vinkelen)\b/i.test(task.studentText)
      if (!isMathDraft(task)) {
        // Bare referanser med en egen formulering – en kort mal som «Regn ut: a + b = __» er ikke en formulering å kopiere.
        if (
          !figureCarriesContent &&
          references.some((r) => hasWording(r.studentText) && textSimilarity(task.studentText, r.studentText) >= TEXT_SIMILARITY_THRESHOLD)
        ) {
          return remove(task, 'copiedReference')
        }
        // Divisjon og Problemløsing: de samme tallene som en referanse og lignende formulering er samme oppgave
        // (samme gangefakta i et annet format, f.eks. «__ · 8 = 56» og «Regn ut 56 : 8», er lov).
        if ((division || problemSolving || numbersAndOperations || measurement) && references.some((r) => numbersIn(task.studentText) === numbersIn(r.studentText) && textSimilarity(task.studentText, r.studentText) >= SAME_NUMBERS_SIMILARITY)) {
          return remove(task, 'copiedReference')
        }
      } else if (placeValue) {
        // Store tall: et regnestykke med nøyaktig de samme tallene som en referanse er en kopi.
        // (I multiplikasjon kan enkle gangestykker gå igjen.)
        const fact = `${task.a}${task.operator}${task.b}`
        if (references.some((r) => referenceFacts(r.studentText).has(fact))) return remove(task, 'copiedReference')
      }
      // Nivå 1 i Tall og plassverdi og Divisjon: hovedsakelig ett faglig steg – ikke flerstegs- eller
      // feilanalyseoppgaver (gjelder også med «Andre ønsker»). Problemløsing har egne nivåregler: synlige
      // mellomsteg og svaralternativer hører hjemme på nivå 1 (se problemSolvingChecks.ts).
      // Måling: nivå 1 kan ha to korte spørsmål («Trenger du å vite arealet eller omkretsen? …»), som referansene.
      if (!multiplication && !problemSolving && task.level === 1 && !isMathDraft(task)) {
        const tooLong = measurement ? task.studentText.length > 180 : isLongOrMultiPart(task.studentText)
        if (tooLong || ERROR_ANALYSIS.test(task.studentText)) return remove(task, 'levelMismatch')
      }
      inResponse.add(keys.exact)
      inResponse.add(keys.swapped)
      if (!isMathDraft(task)) addText(task.level, task.studentText, visualSignature(task.figure))
      return true
    })
  } else {
    const outside = tasks.filter((t) => outsideTables(t, factorsOf(t.level))).length
    if (outside) issues.push(`${outside} gangestykker utenfor øktas gangetabeller`)
  }

  for (const reason of Object.keys(removed) as RemovalReason[]) {
    if (removed[reason]) issues.push(`${removed[reason]} tatt bort (${reason})`)
  }
  return { accepted: tasks, rejected, removed, issues }
}

const signs: Record<AiOperator, string> = { '+': '+', '-': '−', '*': '·', '/': ':' }

/** Kort, normalisert signatur for en oppgave: «7 · 8» for regnestykker, starten av teksten ellers. */
export function signatureOf(task: AiTaskDraft | AiExistingTask): string {
  if ('format' in task && isMathDraft(task)) return `${task.a} ${signs[task.operator]} ${task.b}`
  if ('operator' in task && task.operator && task.a !== undefined && task.b !== undefined) return `${task.a} ${signs[task.operator]} ${task.b}`
  const text = 'studentText' in task ? task.studentText : (task.text ?? '')
  const normalized = normalizeText(text)
  return `«${normalized.length > 80 ? `${normalized.slice(0, 80)} …` : normalized}»`
}

/**
 * Sjekker generelle oppgaver i ett svar (se checkCandidates) og kutter til bestilt antall per nivå.
 * Manglende oppgaver gir en advarsel. Et svar uten oppgaver (f.eks. et oppfølgingsspørsmål i
 * melding) sjekkes ikke for antall. Oppgavebestillingen bruker i tillegg reserver og utfylling
 * (se taskHandler.ts).
 */
export function checkGeneralResult(result: TaskResult, request: GeneralRequest): GeneralCheck {
  const { perLevel } = request
  const checked = checkCandidates(result.tasks, request)
  const { removed, issues } = checked
  let tasks = checked.accepted

  const removedText = removalSentence(removed)

  if (tasks.length === 0) {
    const onlyFormat = removed.format > 0 && removedText === removalSentence({ ...emptyRemoved(), format: removed.format })
    const warning = onlyFormat
      ? 'AI-oppgavene passet ikke formatet i oppgavesettet og ble ikke lagt til. Prøv igjen.'
      : removedText
        ? `Ingen av AI-oppgavene ble lagt til. ${removedText} Prøv igjen.`
        : undefined
    return { result: { ...result, tasks }, warning, issues, removed }
  }

  const missing: string[] = []
  tasks = LEVELS.flatMap((level) => {
    const onLevel = tasks.filter((t) => t.level === level)
    if (onLevel.length > perLevel) issues.push(`nivå ${level}: ${onLevel.length} oppgaver, ${perLevel} bestilt`)
    if (onLevel.length === 0) missing.push(`nivå ${level} mangler`)
    else if (onLevel.length < perLevel) missing.push(`nivå ${level} fikk ${onLevel.length} av ${perLevel}`)
    return onLevel.slice(0, perLevel)
  })
  issues.push(...missing)

  const warning = missing.length
    ? `AI-en laget færre oppgaver enn bestilt (${missing.join(', ')}).${removedText ? ` ${removedText}` : ''} Lag flere, eller legg dem til selv.`
    : removedText || undefined
  return { result: { ...result, tasks }, warning, issues, removed }
}
