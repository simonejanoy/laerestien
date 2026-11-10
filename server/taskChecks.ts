import {
  isMathDraft,
  type AiExistingTask,
  type AiLevel,
  type AiLevelContext,
  type AiOperator,
  type AiTaskDraft,
  type TaskRequest,
  type TaskResult,
} from '../src/ai/contract.ts'
import { strategyProblem } from '../src/features/topics/multiplicationStrategies.ts'

// Kontroller av generelle oppgaver etter at AI-en har svart. Stiltreff styres av
// øktprofilen, referansene og AI-reglene – her sjekkes bare det som kan måles sikkert.
// Ingen nye Gemini-kall: oppgaver som ikke passer, tas bort, og læreren får beskjed om hvorfor.

const LEVELS: AiLevel[] = [1, 2, 3]

/** Tekstoppgaver som er minst så like en referanses formulering (tall ikke medregnet), avvises. Justeres etter testing. */
export const TEXT_SIMILARITY_THRESHOLD = 0.75

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
  const [a, b] = swapped && f.operator === '*' ? [Math.min(f.a, f.b), Math.max(f.a, f.b)] : [f.a, f.b]
  return `${level}|regnestykke|${f.taskType}|${instructionPurpose(f.instruction)}|${a}${f.operator}${b}`
}

const textKey = (level: AiLevel, text: string, figure = false) => `${level}|tekst|${figure ? 'figur' : ''}|${normalizeText(text)}`

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
  const key = textKey(level, text, 'figure' in task && task.figure === true)
  return { exact: key, swapped: key }
}

// ---------------------------------------------------------------------------------------------
// Likhet med referansenes formulering: ordpar etter at tallene er maskert, Dice-koeffisient.

function wordPairs(text: string) {
  const words = normalizeText(text.replace(/\d+/g, '#')).split(' ').filter(Boolean)
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
  copiedReference: 'kopierte formuleringen i en referanseoppgave',
}

const emptyRemoved = (): Record<RemovalReason, number> => ({
  format: 0,
  duplicateInResponse: 0,
  duplicateInSet: 0,
  swappedFactors: 0,
  outsideTables: 0,
  invalidStrategy: 0,
  copiedReference: 0,
})

/** «Tatt bort: 2 som var like …, 1 som …» – eller tom streng. */
function removalSentence(removed: Record<RemovalReason, number>) {
  const parts = (Object.keys(removed) as RemovalReason[]).filter((r) => removed[r] > 0).map((r) => `${removed[r]} som ${REMOVAL_TEXT[r]}`)
  if (parts.length === 0) return ''
  const total = Object.values(removed).reduce((a, b) => a + b, 0)
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} og ${parts.at(-1)}` : parts[0]
  return `${total} ${total === 1 ? 'oppgave' : 'oppgaver'} ble tatt bort: ${list}.`
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
 * - med fagområde (multiplikasjon) i tillegg:
 *   - like oppgaver i svaret, blant tidligere godkjente kandidater (`accepted`) og i oppgavesettet
 *     tas bort; byttede faktorer regnes som like, med mindre øktprofilen tillater dem
 *   - gangestykker utenfor øktas gangetabeller tas bort når læreren ikke har skrevet egne ønsker
 *   - regnestykker med en strategi som ikke passer stykket (f.eks. «10-gangen minus én gruppe» til 8 · 7) tas bort
 *   - tekstoppgaver som er svært like en referanses formulering tas bort
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
    tasks = tasks.filter((task) => {
      const keys = keysOf(task.level, task)
      if (inResponse.has(keys.exact) || (!allowSwapped && inResponse.has(keys.swapped))) return remove(task, 'duplicateInResponse')
      if (inSet.get(keys.exact) === 'exact') return remove(task, 'duplicateInSet')
      if (!allowSwapped && inSet.has(keys.swapped)) return remove(task, 'swappedFactors')
      if (!hasWishes && outsideTables(task, factorsOf(task.level))) return remove(task, 'outsideTables')
      // En strategi i instruksjonen må passe akkurat dette regnestykket – også når læreren har ønsker.
      if (isMathDraft(task) && strategyProblem(task.instruction, task.a, task.b)) return remove(task, 'invalidStrategy')
      if (!isMathDraft(task)) {
        const references = levelInfo(task.level)?.referenceTasks ?? []
        if (references.some((r) => textSimilarity(task.studentText, r.studentText) >= TEXT_SIMILARITY_THRESHOLD)) {
          return remove(task, 'copiedReference')
        }
      }
      inResponse.add(keys.exact)
      inResponse.add(keys.swapped)
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
