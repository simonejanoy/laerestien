import { isMathDraft, type AiTaskDraft, type ArithmeticArea } from '../src/ai/contract.ts'
import { normalizeOperator, type ExpectedAnswer, type PartAnswer, type QuestionPart } from '../src/ai/patternDisplay.ts'
import { isBoxEquationLine, questionsIn, textBlocks } from '../src/ai/taskText.ts'
import { NEGATIVE } from './divisionChecks.ts'
import { MISSING_FIGURE } from './geometryChecks.ts'
import { unitEquationProblem } from './measurementChecks.ts'
import { ANY_DECIMAL, DOT_DECIMAL } from './numbersAndOperationsChecks.ts'
import { equationsIn, numberLimit, operationFits } from './problemSolvingChecks.ts'
import { arithmeticReferences } from './references/arithmetic.ts'
import { evaluate } from './references/validate.ts'

// Faglige kontroller for AI-oppgaver i Regning. Diagrammer og tabeller står som tekst (én rad per linje, | mellom
// kolonnene, ■ i søylediagrammer) og leses og regnes ut: skala, verdier, summer, forskjeller, «Til sammen»-kolonner,
// tidsintervaller og påstander. Ukjente tall (□) kontrolleres ved å sette inn svaret. Felles kontroller gjenbrukes:
// regnestykker og regneart fra Problemløsing, klokkeslett fra Måling, negative tall fra Divisjon og desimaltall fra
// Tall og regning. Kontrollene gjelder alltid – også når læreren har skrevet «Andre ønsker».

export type ArithmeticProblem =
  | 'format'
  | 'offTopic'
  | 'wrongArea'
  | 'wrongSolution'
  | 'wrongConclusion'
  | 'wrongOperation'
  | 'wrongRemainder'
  | 'wrongTime'
  | 'missingInfo'
  | 'missingFigure'
  | 'outsideRange'
  | 'levelMismatch'
  | 'revealedSolution'
  | 'unclearSolution'
  | 'unreasonableAnswer'
  | 'invalidDiagram'
  | 'invalidTable'
  | 'invalidUnknown'

export interface ArithmeticContext {
  area: ArithmeticArea
  /** Største tall i oppgavesettet på nivået. Tallområdet er det største av dette og referansene på nivået. */
  existingMax?: number
  /**
   * Fylles med svaret appen kan rette automatisk når kontrollen selv har regnet det ut og funnet det i fasiten: regnetegnet
   * som mangler, tallene i de tomme rutene i en tabell, eller tallet for □ (ett per □ i likningene). Oppgaver der eleven
   * vurderer, lager eller forklarer noe annet, får ikke svar.
   */
  found?: { expected?: ExpectedAnswer }
}

type Found = { expected?: ExpectedAnswer }

// ---------------------------------------------------------------------------------------------
// Felles

const numbersOf = (text: string) => (text.match(/\d+/g) ?? []).map(Number)
const conclusionOf = (solution: string) => /^\s*(ja|nei)\b/i.exec(solution)?.[1].toLowerCase() ?? null

/** Eleven vurderer en påstand eller finner en feil. */
const ASSESSMENT = /har \p{L}+ rett|hvem har rett|stemmer (det|dette|påstanden)|sier:|sier at|mener at|svarer at|påstår|hevder|hva er feil|hva har \p{L}+ gjort feil|gjort feil|sant eller usant|sann eller usann|sanne eller usanne/iu
/** Eleven lager noe selv (diagram, tabell, fortelling). */
const CREATE = /^\s*lag\b|\blag (et|en|ei|fire|to|tre|ett)\b/i

/** Regnestykker med «=» (operandene er forklaring, resultatet er kontrollert av regnestykkekontrollen). */
const EQUATION_RUN = /\d+(?:\s*[+\-−·x×*:/]\s*\d+)+\s*=\s*\d+/g
/** Klokkeslett (08:05) og etiketter som «Uke 4» eller «4A» er ikke tall eleven har regnet ut. */
const CLOCK = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g

/** Tallene i fasiten utenfor regnestykkene og klokkeslettene. */
const freeNumbers = (solution: string) => numbersOf(solution.replace(EQUATION_RUN, ' ').replace(/(?<![\d:])\d{1,2}:\d{2}(?![\d:])/g, ' '))

/** Alle summer av to eller flere av tallene (høyst 8 tall). */
function subsetSums(values: number[]): number[] {
  const list = values.slice(0, 8)
  const sums: number[] = []
  for (let mask = 1; mask < 1 << list.length; mask++) sums.push(list.reduce((sum, v, i) => (mask & (1 << i) ? sum + v : sum), 0))
  return sums
}

/**
 * Tallene som kan leses av eller regnes ut av verdiene: verdiene, summer og forskjeller – og doble og halve bare når
 * oppgaven handler om det («dobbelt så mange»). Ellers ville antallet ■ (halve verdien med skala 2) slippe gjennom.
 */
function derivable(values: number[], extra: number[] = [], doubles = false): Set<number> {
  const set = new Set<number>([...values, ...extra, ...subsetSums(values)])
  for (const a of values) {
    if (doubles) {
      set.add(2 * a)
      if (a % 2 === 0) set.add(a / 2)
    }
    for (const b of values) if (a > b) set.add(a - b)
  }
  return set
}

const DOUBLES = /dobbelt|halvparten|halvt så/i

/** Navnet i en rad (små bokstaver) og en kort stamme til å finne det igjen i teksten («sykkel» → «syk»). */
const stemOf = (label: string) => label.toLowerCase().slice(0, Math.min(3, label.length))

/** Navnet en tekstbit handler om: den første raden der stammen står først i et ord. */
function labelIn(fragment: string, labels: string[]): string | null {
  const lower = fragment.toLowerCase()
  let best: { label: string; at: number } | null = null
  for (const label of labels) {
    const full = new RegExp(`(?<![\\p{L}\\d])${label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').exec(lower)
    const stem = full ?? new RegExp(`(?<![\\p{L}\\d])${stemOf(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').exec(lower)
    if (stem && (!best || stem.index < best.at)) best = { label, at: stem.index }
  }
  return best?.label ?? null
}

/**
 * Påstanden i oppgaveteksten om verdiene («Dobbelt så mange går som sykler», «Det kom 2 flere på søndag enn på lørdag»,
 * «Antallet øker hver uke»): sann eller usann, eller null når den ikke kan leses.
 */
function claimTruth(studentText: string, values: Map<string, number>, ordered: number[]): boolean | null {
  const claim = /«([^»]+)»/.exec(studentText)?.[1] ?? /(?:sier|mener|påstår) at ([^.?!]+)/i.exec(studentText)?.[1]
  if (!claim) return null
  const labels = [...values.keys()]
  const value = (fragment: string) => {
    const label = labelIn(fragment, labels)
    return label === null ? null : values.get(label)!
  }
  const pair = (re: RegExp) => {
    const m = re.exec(claim)
    if (!m) return null
    const [a, b] = [value(m[1]), value(m[2])]
    return a === null || b === null ? null : { a, b, m }
  }
  if (/øker hver|blir flere hver|stiger hver/i.test(claim)) return ordered.every((v, i) => i === 0 || v > ordered[i - 1])
  if (/minker hver|blir færre hver|synker hver/i.test(claim)) return ordered.every((v, i) => i === 0 || v < ordered[i - 1])
  let p = pair(/dobbelt så mange (.+?) som (.+)/i)
  if (p) return p.a === 2 * p.b
  p = pair(/like mange (.+?) som (.+)/i)
  if (p) return p.a === p.b
  const diff = /(\d+) flere (.+?) enn (.+)/i.exec(claim)
  if (diff) {
    const [a, b] = [value(diff[2]), value(diff[3])]
    if (a !== null && b !== null) return a - b === Number(diff[1])
  }
  p = pair(/flere (.+?) enn (.+)/i)
  if (p) return p.a > p.b
  p = pair(/færre (.+?) enn (.+)/i)
  if (p) return p.a < p.b
  return null
}

/** «Fotball: 12», «Torsdag var varmest med 12 grader»: tallet rett etter et navn skal være verdien i raden. */
function pairingProblem(solution: string, values: Map<string, number>): boolean {
  const labels = [...values.keys()]
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    for (const m of solution.matchAll(new RegExp(`(?<![\\p{L}\\d])${escaped}(?![\\p{L}\\d])([^.!?\\d]{0,30}?)(\\d+)(?!\\s*[+\\-−·x×*:/=\\d])`, 'giu'))) {
      // Et annet navn mellom navnet og tallet: tallet hører til det andre navnet.
      if (labels.some((other) => other !== label && labelIn(m[1], [other]) !== null)) continue
      if (/\b(og|eller|enn|mellom|fra|til)\b/i.test(m[1])) continue
      if (Number(m[2]) !== values.get(label)) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------------------------
// Diagrammer og tabeller skrevet som tekst

const cellsOf = (line: string) => line.split('|').map((c) => c.trim())
/** Datablokkene i teksten: rader med celler. */
const dataBlocksIn = (text: string) => textBlocks(text).filter((b) => b.kind === 'data').map((b) => b.text.split('\n').map(cellsOf))
const isBar = (cell: string) => /^■+$/.test(cell.replace(/\s/g, ''))
const isDiagram = (rows: string[][]) => rows.length > 0 && rows.every((r) => r.length === 2 && isBar(r[1]))

/** Hvor mye hver ■ er («Hver ■ er 2 elever»), eller null. */
const scaleOf = (text: string) => {
  const m = /hver ■ (?:er|betyr|står for|viser) (\d+)/i.exec(text)
  return m ? Number(m[1]) : null
}

/** Andre diagramtyper enn søylediagram med ■ kan ikke vises som tekst. */
const OTHER_CHART = /linjediagram|sektordiagram|kakediagram|piktogram|stolpediagram med figurer|punktdiagram|histogram/i

function diagramProblem(studentText: string, solution: string, assessment: boolean): ArithmeticProblem | null {
  const scale = scaleOf(studentText)
  const blocks = dataBlocksIn(studentText).filter(isDiagram)
  if (blocks.length === 0) {
    // Eleven lager diagrammet: verdiene må kunne vises med hele ■, og fasiten må ha riktig antall ■ for hver.
    if (!CREATE.test(studentText)) return 'missingFigure'
    if (!scale) return 'invalidDiagram'
    const given = [...studentText.matchAll(/(\p{L}+) (\d+)(?=\s*(?:,|og|\.|$))/gu)].map((m) => ({ label: m[1].toLowerCase(), value: Number(m[2]) }))
    if (given.some((g) => g.value % scale !== 0)) return 'invalidDiagram'
    for (const m of solution.matchAll(/(\d+) ■ for (\p{L}+)/gu)) {
      const g = given.find((x) => x.label === m[2].toLowerCase())
      if (g && g.value / scale !== Number(m[1])) return 'wrongSolution'
    }
    return null
  }
  // Skala, navn og hele ■ i hver rad.
  if (!scale) return 'invalidDiagram'
  const rows = blocks[0]
  if (rows.some((r) => !/\p{L}|\d/u.test(r[0]))) return 'invalidDiagram'
  if (new Set(rows.map((r) => r[0].toLowerCase())).size !== rows.length) return 'invalidDiagram'
  const values = new Map(rows.map((r) => [r[0], r[1].replace(/\s/g, '').length * scale] as const))
  const ordered = [...values.values()]

  // Fasiten: tallet rett etter et navn er verdien i raden, og alle tallene kan leses av eller regnes ut av diagrammet.
  if (pairingProblem(solution, values)) return 'wrongSolution'
  const allowed = derivable(ordered, [...numbersOf(studentText), scale], DOUBLES.test(studentText))
  if (freeNumbers(solution).some((n) => !allowed.has(n))) return 'wrongSolution'

  // Påstander: konklusjonen må stemme.
  const truth = claimTruth(studentText, values, ordered)
  const conclusion = conclusionOf(solution)
  if (assessment && truth !== null && conclusion && (conclusion === 'ja') !== truth) return 'wrongConclusion'
  return null
}

/** Verdien i en celle: et tall (med eller uten enhet), et klokkeslett i minutter, eller null (tomt felt eller tekst). */
function cellValue(cell: string): number | null | 'blank' {
  if (/^_{2,}$/.test(cell) || cell === '□') return 'blank'
  const clock = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(cell)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  const m = /^(\d+)(?:\s*\p{L}+)?$/u.exec(cell)
  return m ? Number(m[1]) : null
}

const TOTAL = /til sammen|totalt|^sum$|i alt/i

function tableProblem(studentText: string, solution: string, assessment: boolean, found: Found = {}): ArithmeticProblem | null {
  const blocks = dataBlocksIn(studentText).filter((b) => !isDiagram(b))
  if (blocks.length === 0) {
    if (!CREATE.test(studentText)) return 'missingFigure'
    // Eleven lager tabellen: tallene i fasiten kan regnes ut av tallene i teksten.
    const allowed = derivable(numbersOf(studentText), [], DOUBLES.test(studentText))
    return freeNumbers(solution).some((n) => !allowed.has(n)) ? 'wrongSolution' : null
  }
  const [header, ...rows] = blocks[0]
  // Overskriftsrad med tydelige kolonnenavn, og like mange kolonner i alle radene.
  if (header.length < 2 || header.some((c) => !/\p{L}{2,}/u.test(c) || /^\d/.test(c))) return 'invalidTable'
  if (rows.length === 0 || rows.some((r) => r.length !== header.length)) return 'invalidTable'
  if (studentText.match(CLOCK) === null && /\b\d{1,2}[:.]\d{2}\b/.test(blocks[0].flat().join(' '))) return 'wrongTime'

  const cells = rows.map((r) => r.map(cellValue))
  const numericCols = header.map((_, c) => c).filter((c) => cells.every((r) => r[c] !== null))
  const expected: number[] = []

  // «Til sammen»-kolonnen er summen av de andre tallkolonnene (utenom den første kolonnen med navn).
  const totalCol = header.findIndex((h) => TOTAL.test(h))
  if (totalCol > 0) {
    const parts = numericCols.filter((c) => c !== totalCol && c > 0)
    for (const row of cells) {
      const blanks = [...parts, totalCol].filter((c) => row[c] === 'blank')
      if (blanks.length > 1) return 'missingInfo'
      const sum = parts.reduce((s, c) => s + (typeof row[c] === 'number' ? (row[c] as number) : 0), 0)
      if (blanks.length === 0 && sum !== row[totalCol]) return 'invalidTable'
      if (blanks.length === 1) expected.push(blanks[0] === totalCol ? sum : (row[totalCol] as number) - sum)
    }
  } else if (header.length === 2 && numericCols.length === 2 && cells.some((r) => r[1] === 'blank')) {
    // To tallkolonner med en regel (sykler → hjul): finn regelen i de hele radene og regn ut de tomme feltene.
    const full = cells.filter((r) => typeof r[0] === 'number' && typeof r[1] === 'number') as number[][]
    if (full.length < 2) return 'missingInfo'
    const a = (full[1][1] - full[0][1]) / (full[1][0] - full[0][0])
    const b = full[0][1] - a * full[0][0]
    if (!full.every(([x, y]) => a * x + b === y)) return 'invalidTable'
    for (const r of cells) if (r[1] === 'blank' && typeof r[0] === 'number') expected.push(a * r[0] + b)
  }
  if (expected.some((v) => !Number.isInteger(v) || v < 0)) return 'invalidTable'
  if (expected.length > 0 && expected.some((v) => !numbersOf(solution).includes(v))) return 'wrongSolution'
  // Tallene i de tomme rutene, rad for rad: appen viser én inputboks per rute og retter dem.
  const blankCount = cells.flat().filter((v) => v === 'blank').length
  if (blankCount > 0 && blankCount === expected.length) found.expected = { kind: 'numbers', values: expected }

  // Tid: klokkeslett i tabellen og tidsintervall «fra … til …» (samme regnestykker med klokkeslett som i Måling).
  const labels = rows.map((r) => r[0])
  const times = new Map(rows.map((r, i) => [r[0], cells[i].find((v, c) => c > 0 && /:/.test(r[c]) && typeof v === 'number') as number | undefined]))
  if ([...times.values()].some((t) => t !== undefined)) {
    if (unitEquationProblem(solution, true)) return 'wrongTime'
    const span = /fra (.+?) til (.+?)[?.]/i.exec(studentText)
    if (span && /hvor lang tid/i.test(studentText)) {
      const [from, to] = [labelIn(span[1], labels), labelIn(span[2], labels)]
      const [t1, t2] = [from && times.get(from), to && times.get(to)]
      if (typeof t1 === 'number' && typeof t2 === 'number') {
        const minutes = /(\d+)\s*min/i.exec(solution)
        if (!minutes || Number(minutes[1]) !== t2 - t1) return 'wrongTime'
      }
    }
  }

  // Fasiten: tallene kan leses av eller regnes ut av tabellen (også antall · pris og summen av to slike).
  const values = cells.flat().filter((v): v is number => typeof v === 'number')
  const textNumbers = numbersOf(studentText)
  const products = values.flatMap((v) => textNumbers.filter((k) => k > 0 && k <= 20).map((k) => k * v))
  const allowed = derivable(values, [...textNumbers, ...expected, ...products], DOUBLES.test(studentText))
  for (const a of products) for (const b of products) allowed.add(a + b)
  for (const [, t] of times) for (const [, u] of times) if (t !== undefined && u !== undefined && u > t) allowed.add(u - t)
  if (freeNumbers(solution).some((n) => !allowed.has(n))) return 'wrongSolution'

  // Påstander om tabellen: konklusjonen må stemme (verdiene i den siste tallkolonnen).
  const lastCol = numericCols.filter((c) => c > 0).at(-1)
  if (assessment && lastCol !== undefined) {
    const valueMap = new Map(rows.map((r, i) => [r[0], cells[i][lastCol] as number] as const))
    const truth = claimTruth(studentText, valueMap, [...valueMap.values()])
    const conclusion = conclusionOf(solution)
    if (truth !== null && conclusion && (conclusion === 'ja') !== truth) return 'wrongConclusion'
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// De fire regneartene

const OPERATION_NAMES: [RegExp, '+' | '-' | '·' | ':'][] = [
  [/^(addisjon|pluss|legge sammen)/i, '+'],
  [/^(subtraksjon|minus|trekke fra)/i, '-'],
  [/^(multiplikasjon|gange)/i, '·'],
  [/^(divisjon|dele)/i, ':'],
]
const operatorOf = (op: string) => ({ '−': '-', x: '·', '×': '·', '*': '·', '/': ':' })[op] ?? op

/** Like grupper skrevet som «7 rader med 9 stoler» eller «6 esker med 8 kritt» (i tillegg til ordene i Problemløsing). */
const GROUPS_WITH = /\d+ \p{L}+ med \d+ \p{L}+/u

/** Om regnearten passer situasjonen: kontrollen fra Problemløsing, og «N … med M …» som like grupper for gange og dele. */
const fits = (op: '+' | '-' | '·' | ':', story: string) => operationFits(op, story) || ((op === '·' || op === ':') && GROUPS_WITH.test(story))

/** Antall ting som trengs eller blir («Hvor mange bord trengs?»): svaret kan ikke være større enn tallene i oppgaven. */
const HOW_MANY_NEEDED = /hvor mange (bord|poser|busser|biler|lag|grupper|esker|bokser|rader|kasser|turer)\b[^?]*(trengs|blir det|må)/i

function operationsProblem(studentText: string, solution: string, assessment: boolean, found: Found = {}): ArithmeticProblem | null {
  if (/\brest\b|til overs/i.test(solution)) return 'wrongRemainder'
  // Fyll inn regnetegnet: hvert stykke må stå i fasiten med et regnetegn (regnestykkekontrollen sjekker at det stemmer).
  const templates = [...studentText.matchAll(/(\d+)\s*_{2,}\s*(\d+)\s*=\s*(\d+)/g)]
  for (const [, a, b, c] of templates) {
    const filled = new RegExp(`(?<!\\d)${a}\\s*([+\\-−·x×*:/])\\s*${b}\\s*=\\s*${c}(?!\\d)`).exec(solution)
    if (!filled) return 'wrongSolution'
    // Ett stykke: appen viser fire knapper og retter regnetegnet.
    const sign = normalizeOperator(filled[1])
    if (templates.length === 1 && sign) found.expected = { kind: 'operator', value: sign as '+' | '−' | '·' | ':' }
  }
  if (templates.length > 0) return null

  // Delspørsmål a), b) … med hver sin situasjon og hvert sitt regnestykke.
  const storyParts = studentText.split(/\n\s*(?=[a-d]\)\s)/).slice(1)
  if (storyParts.length >= 2) {
    const answerParts = solution.split(/(?=(?:^|\s)[a-d]\)\s)/).map((s) => s.trim()).filter((s) => /^[a-d]\)/.test(s))
    for (const story of storyParts) {
      const letter = story.trim()[0]
      const answer = answerParts.find((a) => a.startsWith(`${letter})`))
      const eq = answer ? equationsIn(answer)[0] : undefined
      if (!eq) return 'unclearSolution'
      if (eq.operators.length === 1 && !fits(operatorOf(eq.operators[0]) as never, story)) return 'wrongOperation'
    }
    return null
  }

  const equations = equationsIn(solution)
  // Regnearten fasiten nevner, må være regnearten i stykket – og passe situasjonen.
  const named = OPERATION_NAMES.find(([re]) => re.test(solution.trim()))?.[1]
  // Feilsøking: regnestykket noen andre har regnet («Hun regner 48 · 6 = 288.») er ikke situasjonen.
  const story = studentText.replace(/\b(?:hun|han|de) regner [^.?!]*[.?!]/gi, ' ')
  if (named) {
    if (!equations[0] || operatorOf(equations[0].operators[0]) !== named) return 'wrongOperation'
    if (!fits(named, story)) return 'wrongOperation'
  } else if (!CREATE.test(studentText) && equations.length === 1 && equations[0].operators.length === 1) {
    if (!fits(operatorOf(equations[0].operators[0]) as never, story)) return 'wrongOperation'
  }

  // Rimelig svar: flere bord, poser eller busser enn det er ting eller personer er ikke rimelig.
  const needed = HOW_MANY_NEEDED.exec(studentText)
  if (needed && !assessment) {
    const answer = equations.at(-1)?.result
    if (answer !== undefined && answer > Math.max(...numbersOf(studentText))) return 'unreasonableAnswer'
  }

  // Overslag: et regnestykke med et avrundet tall (nær et tall i oppgaven), og konklusjonen ut fra overslaget.
  const budget = /\bhar (\d+) kr\b/i.exec(studentText)
  const conclusion = conclusionOf(solution)
  if (/overslag/i.test(studentText)) {
    const given = numbersOf(studentText)
    const estimate = equations.find((e) => e.operands.some((o) => o % 10 === 0 && !given.includes(o) && given.some((g) => g > 0 && Math.abs(g - o) <= g * 0.15)))
    if (!estimate) return 'wrongSolution'
    if (budget && conclusion && (conclusion === 'nei') !== estimate.result > Number(budget[1])) return 'wrongConclusion'
  } else if (budget && conclusion && /\bnok\b/i.test(studentText) && equations[0]) {
    // «Er det nok penger?»: ja når prisen er høyst det de har.
    if ((conclusion === 'ja') !== equations[0].result <= Number(budget[1])) return 'wrongConclusion'
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Utforske algebra: □ er alltid et ukjent tall.

/** Eleven vurderer om likninger er sanne («sant eller usant», «sann eller usann»). */
const TRUE_OR_FALSE = /\bsann?t? eller usann?t?\b|\bsanne eller usanne\b/i

/** Bokstaver som ukjent tall («x + 4 = 9», «3 · y»). Bokstaven x mellom to tall er et gangetegn. */
const LETTER_UNKNOWN = /(?:^|[\s(=+\-−·:])[xyz](?=\s*(?:[=+\-−·:)]|$))|[=+\-−·:]\s*[xyz](?![\p{L}\d])/mu
/** □ brukt som regnetegn («24 □ 6 = 30»). */
const BOX_AS_OPERATOR = /\d\s*□\s*\d/
/** Et tomt felt for et tall i en likning skal være □, ikke __ (__ er for regnetegn og felt i tabeller). */
const BLANK_NUMBER = /(?:^|[=+\-−·:(]\s*)_{2,}\s*(?:[=+\-−·:)]|$)|(?:[=+\-−·:(]\s*)_{2,}\s*$/m

/** Likningene med □ i teksten, én per linje («□ + 7 = 15», «7 + 5 = □ + 4»). */
function boxEquationsIn(text: string): string[] {
  return text.split('\n').flatMap((line) => [...line.matchAll(/[\d□(][\d□\s+\-−·×*:/()]*=[\d□\s+\-−·×*:/()]*[\d□)]/g)].map((m) => m[0]).filter((e) => e.includes('□')))
}

/** Om likningen er sann når □ er `value` (samme tall for alle □). */
function holds(equation: string, value: number): boolean | null {
  const sides = equation.replace(/□/g, String(value)).split('=')
  if (sides.length !== 2) return null
  const [left, right] = sides.map((s) => evaluate(s))
  return left === null || right === null ? null : Math.abs(left - right) < 1e-9
}

/** Verdien fasiten gir for □ («□ = 8»), eller null. */
const boxValueIn = (solution: string) => {
  const m = /□\s*(?:=|er)\s*(\d+)/.exec(solution)
  return m ? Number(m[1]) : null
}

function algebraProblem(studentText: string, solution: string, found: Found = {}): ArithmeticProblem | null {
  // Påstander om likhet («Er påstandene sanne eller usanne?»): hver likning vurderes riktig i fasiten.
  if (TRUE_OR_FALSE.test(studentText)) {
    const claims = studentText.split('\n').filter((l) => /=/.test(l) && !/□/.test(l) && /^[\d\s+\-−·×*:/()=]+$/.test(l.trim()))
    for (const claim of claims) {
      const [left, right] = claim.split('=').map((s) => evaluate(s))
      if (left === null || right === null) return 'unclearSolution'
      const truth = left === right
      const escaped = claim.trim().replace(/[+*()]/g, '\\$&').replace(/\s+/g, '\\s*')
      const said = new RegExp(`${escaped}[^.]{0,12}?\\ber (sant|usant|riktig|feil)`, 'i').exec(solution)
      if (!said) return 'unclearSolution'
      if (['sant', 'riktig'].includes(said[1].toLowerCase()) !== truth) return 'wrongConclusion'
    }
    return null
  }

  const value = boxValueIn(solution)
  const equations = boxEquationsIn(studentText)
  // Balansevekt: like mye på begge sider («På den ene siden ligger 4 klosser og 6 klosser. På den andre siden ligger □ klosser.»).
  const one = /(?:ene|venstre) siden?\b([^.]*)\./i.exec(studentText)
  const other = /(?:andre|høyre) siden?\b([^.]*)\./i.exec(studentText)
  if (equations.length === 0 && one && other) {
    if (value === null) return 'unclearSolution'
    const side = (text: string) => numbersOf(text).reduce((a, b) => a + b, 0) + (text.match(/□/g)?.length ?? 0) * value
    if (side(one[1]) !== side(other[1])) return 'wrongSolution'
    found.expected = { kind: 'number', value }
    return null
  }
  if (equations.length === 0) return CREATE.test(studentText) ? null : 'missingInfo'
  if (value === null) return 'unclearSolution'
  for (const equation of equations) {
    const ok = holds(equation, value)
    if (ok === null) return 'invalidUnknown'
    if (!ok) return 'wrongSolution'
    // Entydig: en annen verdi for □ gjør ikke likningen sann.
    if (holds(equation, value + 1) || (value > 0 && holds(equation, value - 1))) return 'invalidUnknown'
  }
  // «Leo skriver 12. Har Leo rett?»: konklusjonen må stemme med verdien.
  const claimed = /(?:skriver|svarer(?: at □ er)?|sier at □ er|mener at □ er|tror at □ er)\s*(\d+)/i.exec(studentText)
  const conclusion = conclusionOf(solution)
  if (claimed && conclusion && (conclusion === 'ja') !== (Number(claimed[1]) === value)) return 'wrongConclusion'
  // Likninger på egne linjer: én inputboks per □ (samme tall i alle). Ellers skriver eleven tallet.
  const boxes = studentText.split('\n').filter(isBoxEquationLine).reduce((n, line) => n + (line.match(/□/g)?.length ?? 0), 0)
  found.expected = boxes > 0 ? { kind: 'numbers', values: Array(boxes).fill(value) } : { kind: 'number', value }
  return null
}

// ---------------------------------------------------------------------------------------------
// Hele kontrollen

export type ArithmeticKind = 'diagram' | 'tabell' | 'regnearter' | 'algebra'

const KIND_OF_AREA: Record<ArithmeticArea, ArithmeticKind> = { diagrammer: 'diagram', tabeller: 'tabell', 'fire-regnearter': 'regnearter', algebra: 'algebra' }

/** Hva slags oppgave det er: diagram, tabell, algebra (□, likhet) eller regnearter. */
export function kindOf(studentText: string): ArithmeticKind {
  const blocks = dataBlocksIn(studentText)
  if (blocks.some(isDiagram) || /■|søylediagram/i.test(studentText)) return 'diagram'
  if (blocks.length > 0 || /\btabell/i.test(studentText)) return 'tabell'
  if (/□|likning|balanse|likhetstegnet/i.test(studentText) || TRUE_OR_FALSE.test(studentText)) return 'algebra'
  return 'regnearter'
}

/** Innhold som ikke hører til Regning: brøk, prosent, geometri og måling med enheter. */
const OFF_TOPIC = /\bbrøk|\bprosent|\bareal|\bomkrets|\bvinkel|(?<!\p{L})(cm|mm|km|kg|dl|liter|gram)(?!\p{L})/iu
/** Henvisning til et diagram, en tabell eller en figur som ikke står i teksten. */
const MISSING_DATA = /\b(se (på )?(diagrammet|tabellen|søylediagrammet|grafen)|(diagrammet|tabellen) (under|over|nedenfor|ovenfor))\b/i
const REVEALED = /\b(svaret|fasiten|riktig svar) (er|blir)\s*\S/i

/**
 * Kontrollerer én AI-oppgave i Regning. Rekkefølge: format (bare tekstoppgaver), negative tall og desimaltall, innhold
 * og diagramtyper utenfor Regning, skrivemåten for ukjente tall, tallområdet, diagrammer og tabeller som ikke vises,
 * fagområdet i økta, nivået og til slutt den faglige kontrollen for oppgavetypen.
 */
export function arithmeticProblem(task: AiTaskDraft, { area, existingMax = 0, found = {} }: ArithmeticContext): ArithmeticProblem | null {
  // Regnestykker viser utregningen under instruksjonen («35 − 12 = ___») og avslører regnearten eleven skal velge.
  if (isMathDraft(task)) return 'format'
  const { studentText, solution, level } = task
  const all = `${studentText}\n${solution}`

  if (NEGATIVE.test(all) || ANY_DECIMAL.test(all) || DOT_DECIMAL.test(all.replace(/kl\.\s/gi, ' '))) return 'outsideRange'
  if (OFF_TOPIC.test(all) || OTHER_CHART.test(studentText)) return 'offTopic'
  if (LETTER_UNKNOWN.test(studentText) || BOX_AS_OPERATOR.test(studentText)) return 'invalidUnknown'
  const limit = Math.max(numberLimit(area, level, arithmeticReferences), existingMax > 0 ? 10 ** Math.ceil(Math.log10(existingMax + 1)) : 0)
  if (numbersOf(all.replace(CLOCK, ' ')).some((n) => n > limit)) return 'outsideRange'
  if (MISSING_FIGURE.test(studentText) || (MISSING_DATA.test(studentText) && dataBlocksIn(studentText).length === 0)) return 'missingFigure'

  // Ukjent tall skrives alltid som □ – et tomt felt (__) i et regnestykke er bare for regnetegn (og felt i tabeller).
  if (BLANK_NUMBER.test(studentText)) return 'invalidUnknown'
  const kind = kindOf(studentText)
  if (KIND_OF_AREA[area] !== kind) return 'wrongArea'
  const assessment = ASSESSMENT.test(studentText)
  if (level === 1 && assessment) return 'levelMismatch'
  if (!assessment && REVEALED.test(studentText)) return 'revealedSolution'

  const result = (() => {
    if (kind === 'diagram') return diagramProblem(studentText, solution, assessment)
    if (kind === 'tabell') return tableProblem(studentText, solution, assessment, found)
    if (kind === 'algebra') return algebraProblem(studentText, solution, found)
    return operationsProblem(studentText, solution, assessment, found)
  })()
  // Flere spørsmål (diagram, tabell eller «Hvilken regneart passer? Hvor mange …?»): ett svarfelt per spørsmål.
  if (!result && !found.expected && kind !== 'algebra') {
    const parts = questionParts(studentText, solution, kind)
    if (parts) found.expected = { kind: 'parts', parts }
  }
  // Oppgaver der eleven vurderer en påstand eller lager noe selv, har ikke ett svar som kan rettes automatisk.
  if (result || assessment || CREATE.test(studentText)) delete found.expected
  return result
}

// ---------------------------------------------------------------------------------------------
// Svarfelt per spørsmål: hvert spørsmål tolkes og besvares ut fra diagrammet, tabellen eller regnestykket.

/** Verdiene i diagrammet (med skala) eller i en tabell med to kolonner (navn og tall), eller null. */
function valuesOf(studentText: string): Map<string, number> | null {
  const blocks = dataBlocksIn(studentText)
  const chart = blocks.find(isDiagram)
  const scale = scaleOf(studentText)
  if (chart && scale) return new Map(chart.map((r) => [r[0], r[1].replace(/\s/g, '').length * scale] as const))
  const table = blocks.find((b) => !isDiagram(b))
  if (!table || table[0].length !== 2) return null
  const rows = table.slice(1).map((r) => [r[0], cellValue(r[1])] as const)
  return rows.every(([, v]) => typeof v === 'number') ? new Map(rows as [string, number][]) : null
}

/**
 * Navnene som står i spørsmålet, i rekkefølge. Hele navnet («onsdag») går foran stammen («syk» for «sykler»), så «mange»
 * ikke leses som «Mandag».
 */
function labelsInQuestion(question: string, labels: string[]): string[] {
  const lower = question.toLowerCase()
  const find = (word: (label: string) => string) =>
    labels
      .map((label) => ({ label, at: lower.search(new RegExp(`(?<![\\p{L}\\d])${word(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u')) }))
      .filter((x) => x.at >= 0)
      .sort((a, b) => a.at - b.at)
      .map((x) => x.label)
  const whole = find((label) => `${label.toLowerCase()}`)
  return whole.length > 0 ? whole : find(stemOf)
}

const MOST = /flest|mest|størst|høyest|varmest|lengst/i
const LEAST = /færrest|minst|lavest|kaldest|kortest/i

/** Svaret på ett spørsmål, eller null når spørsmålet ikke kan tolkes. */
function answerTo(question: string, solution: string, kind: ArithmeticKind, values: Map<string, number> | null): PartAnswer | null {
  if (/hvilken regneart/i.test(question)) {
    const named = OPERATION_NAMES.find(([re]) => re.test(solution.trim()))?.[1]
    return named ? { kind: 'operator', value: named === '-' ? '−' : named } : null
  }
  if (values && /^(hva|hvilken|hvilket|hvem)\b/i.test(question) && (MOST.test(question) || LEAST.test(question))) {
    const entries = [...values]
    const extreme = MOST.test(question) ? Math.max(...entries.map(([, v]) => v)) : Math.min(...entries.map(([, v]) => v))
    const winners = entries.filter(([, v]) => v === extreme)
    return winners.length === 1 ? { kind: 'choice', value: winners[0][0] } : null
  }
  if (!/^hvor (mange|mye)\b/i.test(question)) return null
  if (kind === 'regnearter') {
    const equations = equationsIn(solution)
    return equations.length === 1 ? { kind: 'number', value: equations[0].result } : null
  }
  if (!values) return null
  const named = labelsInQuestion(question, [...values.keys()]).map((l) => values.get(l)!)
  if (named.length === 2 && /flere|færre|mer enn|mindre enn|forskjell/i.test(question)) return { kind: 'number', value: Math.abs(named[0] - named[1]) }
  if (named.length >= 2 && /til sammen|\bog\b/i.test(question)) return { kind: 'number', value: named.reduce((a, b) => a + b, 0) }
  if (named.length === 1) return { kind: 'number', value: named[0] }
  if (named.length === 0 && /til sammen|i alt/i.test(question)) return { kind: 'number', value: [...values.values()].reduce((a, b) => a + b, 0) }
  return null
}

/**
 * Svarfeltene til en oppgave med spørsmål: ett per spørsmål, med svaret regnet ut og funnet igjen i fasiten. Null når et
 * spørsmål ikke kan tolkes – da får eleven et vanlig skrivefelt.
 */
function questionParts(studentText: string, solution: string, kind: ArithmeticKind): QuestionPart[] | null {
  const questions = questionsIn(studentText)
  if (questions.length === 0) return null
  const values = kind === 'regnearter' ? null : valuesOf(studentText)
  const parts: QuestionPart[] = []
  for (const question of questions) {
    const answer = answerTo(question, solution, kind, values)
    if (!answer) return null
    if (answer.kind === 'number' && !numbersOf(solution).includes(answer.value)) return null
    if (answer.kind === 'choice' && !solution.toLowerCase().includes(answer.value.toLowerCase())) return null
    parts.push({ question, answer })
  }
  return parts
}
