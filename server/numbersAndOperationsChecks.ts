import { isMathDraft, type AiTaskDraft, type NumbersAndOperationsArea } from '../src/ai/contract.ts'
import { DIVISION_BY_ZERO, NEGATIVE, REMAINDER_WORD, explicitDivisions, familyProblem, showsRelation } from './divisionChecks.ts'
import { CLAIM, MISSING_FIGURE } from './geometryChecks.ts'
import { REASONING, numberLimit } from './problemSolvingChecks.ts'
import { numbersAndOperationsReferences } from './references/numbersAndOperations.ts'
import { evaluate } from './references/validate.ts'

// Faglige kontroller for AI-oppgaver i Tall og regning. Som i Divisjon og Problemløsing: tallene og regnestykkene
// leses og regnes ut – ordsøk brukes bare til å finne hva oppgaven spør om. Sammenhengen mellom gange og dele
// (og regnefamiliene) kontrolleres med de samme funksjonene som i Divisjon. Kontrollene gjelder alltid – også
// når læreren har skrevet «Andre ønsker».

/** Hvorfor en oppgave i Tall og regning ikke kan brukes. */
export type NumbersProblem =
  | 'offTopic'
  | 'wrongArea'
  | 'wrongSolution'
  | 'wrongConclusion'
  | 'missingRelation'
  | 'wrongRemainder'
  | 'divisionByZero'
  | 'decimalFormat'
  | 'tooManyDecimals'
  | 'wrongConversion'
  | 'missingUnit'
  | 'outsideRange'
  | 'levelMismatch'
  | 'missingFigure'
  | 'revealedSolution'

export interface NumbersContext {
  area: NumbersAndOperationsArea
  secondaryAreas?: readonly NumbersAndOperationsArea[]
}

// ---------------------------------------------------------------------------------------------
// Tall med desimalkomma.

const merge = (text: string) => text.replace(/(\d) (?=\d{3}\b)/g, '$1')
const NUMBER = String.raw`\d+(?:,\d+)?`
const toNumber = (text: string) => Number(text.replace(/\s/g, '').replace(',', '.'))
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9
/** Alle tallene i teksten, med desimalkomma («1,3» er ett tall). */
const numbersIn = (text: string) => (merge(text).match(new RegExp(NUMBER, 'g')) ?? []).map(toNumber)
const digitsIn = (text: string) => (merge(text).match(/\d+/g) ?? []).map(Number)

/** Desimaltall med punktum («2.4»). */
const DOT_DECIMAL = /\d\.\d/
/** Hundredeler eller flere desimaler («1,25», «12,50»), også med ord. */
const HUNDREDTHS = /\d,\d{2,}|hundredel|tusendel/i
const ANY_DECIMAL = /\d,\d/
const OUTSIDE_TOPIC = /\bbrøk|\bvinkel|\bareal\b|\bomkrets|\bprosent|\bvolum\b|liter\b|\bdl\b|\bkilo(gram)?\b|\bkg\b|\bgram\b/i
/** Påstand eller feil som eleven skal vurdere (nivå 3, og ikke på nivå 1). */
const ASSESSMENT = new RegExp(`${CLAIM.source}|stemmer (det|dette)|finn feil|gjort feil|hva er galt`, 'iu')

const NUMBER_WORDS: Record<string, number> = { én: 1, en: 1, ett: 1, ei: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9 }
const countOf = (word: string) => (/^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word.toLowerCase()])
const COUNT = String.raw`(\d+|én|en|ett|ei|to|tre|fire|fem|seks|sju|syv|åtte|ni)`

// ---------------------------------------------------------------------------------------------
// Lengder.

const UNIT_MM: Record<string, number> = { mm: 1, millimeter: 1, cm: 10, centimeter: 10, dm: 100, desimeter: 100, m: 1000, meter: 1000 }
const UNIT = String.raw`(millimeter|centimeter|desimeter|meter|mm|cm|dm|m)`
const MEASURE = new RegExp(String.raw`(${NUMBER})\s*${UNIT}(?![\p{L}])`, 'giu')
const UNIT_WORD = new RegExp(String.raw`(?<![\p{L}])${UNIT}(?![\p{L}])`, 'iu')
const short = (unit: string) => ({ millimeter: 'mm', centimeter: 'cm', desimeter: 'dm', meter: 'm' })[unit.toLowerCase()] ?? unit.toLowerCase()

interface Measure {
  value: number
  unit: string
  /** Lengden i millimeter. */
  mm: number
  index: number
  end: number
}

export function measuresIn(text: string): Measure[] {
  return [...merge(text).matchAll(MEASURE)].map((m) => {
    const unit = short(m[2])
    const value = toNumber(m[1])
    return { value, unit, mm: value * UNIT_MM[unit], index: m.index!, end: m.index! + m[0].length }
  })
}

/** Setninger som bare forklarer enheten («1 cm er 10 mm.») – ikke lengden oppgaven handler om. */
const DEFINITION = /^\s*1 \p{L}+ er (\d+) \p{L}+\.?\s*$/u
const sentences = (text: string) => text.split(/(?<=[.?!])\s+|\n+/)

/** Lengden oppgaven ber eleven gjøre om: én lengde, eller «1 meter og 3 desimeter» lagt sammen. */
function lengthToConvert(studentText: string): number | null {
  const body = sentences(merge(studentText)).filter((s) => !DEFINITION.test(s)).join(' ')
  const all = measuresIn(body)
  if (all.length === 0) return null
  if (all.length === 1) return all[0].mm
  // «1 meter og 3 desimeter», «12 cm og 4 mm»
  if (all.length === 2 && /^\s*og\s*$/.test(body.slice(all[0].end, all[1].index))) return all[0].mm + all[1].mm
  return null
}

/** Enheten svaret skal oppgis i («Skriv … i desimeter», «Hvor mange centimeter …», «… er hvor mange cm?»). */
function targetUnit(studentText: string): string | null {
  const m =
    new RegExp(String.raw`(?:skriv|gjør om|hvor lang\w*|regn om)[^.?!]*?\b(?:i|til) ${UNIT}(?![\p{L}])`, 'iu').exec(studentText) ??
    new RegExp(String.raw`hvor mange ${UNIT}(?![\p{L}])`, 'iu').exec(studentText)
  return m ? short(m[1]) : null
}

/** «A u1 er B u2», «A u1 = B u2», «A u1, som er B u2» (to lengder rett etter hverandre): de må være like lange. */
function conversionErrors(text: string): boolean {
  const list = measuresIn(text)
  const flat = merge(text)
  return list.slice(1).some((m, i) => {
    const prev = list[i]
    if (prev.unit === m.unit) return false
    const between = flat.slice(prev.end, m.index)
    return /^\s*(=|er|er det samme som|,?\s*som er|,?\s*altså|,?\s*det vil si)\s*$/i.test(between) && !same(prev.mm, m.mm)
  })
}

/** Lengder i oppgaveteksten som sammenlignes i ulike enheter må stå i samme enhet i løsningen. */
function missingCommonUnit(studentText: string, solution: string): boolean {
  const given = measuresIn(studentText)
  if (new Set(given.map((m) => m.unit)).size < 2) return false
  const shown = measuresIn(solution)
  return !Object.keys(UNIT_MM)
    .filter((u) => u.length <= 2)
    .some((unit) => given.every((g) => shown.some((s) => s.unit === unit && same(s.mm, g.mm))))
}

// ---------------------------------------------------------------------------------------------
// Tideler, sammenligninger og rekkefølger.

/** Verdien eleven skal skrive som desimaltall («2 hele og 4 tideler», «7 tideler»). */
function decimalToWrite(studentText: string): number | null {
  if (!/skriv (tallet |svaret |det )?(som|med) desimaltall|skriv som desimaltall/i.test(studentText)) return null
  const both = new RegExp(String.raw`${COUNT} hele? og ${COUNT} tidel(?:er)?`, 'iu').exec(studentText)
  if (both) return countOf(both[1]) + countOf(both[2]) / 10
  const tenths = new RegExp(String.raw`(?<![\p{L}])${COUNT} tidel(?:er)?(?![\p{L}])`, 'iu').exec(studentText)
  return tenths ? countOf(tenths[1]) / 10 : null
}

/** Det første tallet i fasiten (med eventuell enhet) – svaret. */
const firstNumber = (solution: string) => numbersIn(solution)[0]

/** Sammenligning: «Hvilket tall er størst, 1,2 eller 0,9?», «Hvilken lengde er lengst: 4,5 cm eller 42 mm?» – fasiten starter med det riktige. */
function comparisonProblem(studentText: string, solution: string): boolean {
  const ask = /\b(størst|minst|lengst|kortest)\b/i.exec(studentText)
  if (!ask || /rekkefølge|sorter|ordne/i.test(studentText)) return false
  const biggest = /størst|lengst/i.test(ask[1])
  const measures = measuresIn(studentText)
  if (measures.length >= 2) {
    const target = biggest ? Math.max(...measures.map((m) => m.mm)) : Math.min(...measures.map((m) => m.mm))
    const answer = measuresIn(solution)[0]
    return !!answer && !same(answer.mm, target)
  }
  // Bare ett par per oppgave (flere par: ikke sikkert hvilket svar som hører til hvilket).
  const pairs = [...merge(studentText).matchAll(new RegExp(String.raw`(${NUMBER}) (?:eller|og) (${NUMBER})`, 'g'))]
  if (pairs.length !== 1) return false
  const [a, b] = [toNumber(pairs[0][1]), toNumber(pairs[0][2])]
  const answer = firstNumber(solution)
  return answer !== undefined && !same(answer, biggest ? Math.max(a, b) : Math.min(a, b))
}

/** Rekkefølge: tallene (eller lengdene) i den første setningen i fasiten må være de samme og stå i riktig rekkefølge. */
function orderProblem(studentText: string, solution: string): boolean {
  const ask = /(?:rekkefølge|sorter\w*|ordne\w*)[^?]*?fra (minst|størst|kortest|lengst) til (størst|minst|lengst|kortest)/i.exec(studentText)
  if (!ask) return false
  const ascending = /minst|kortest/i.test(ask[1])
  const first = sentences(solution)[0] ?? ''
  const givenMeasures = measuresIn(studentText)
  const value = (list: Measure[]) => list.map((m) => m.mm)
  const [given, answer] =
    givenMeasures.length >= 2
      ? [value(givenMeasures), value(measuresIn(first))]
      : [numbersIn(studentText.slice(studentText.includes(':') ? studentText.lastIndexOf(':') : studentText.search(/rekkefølge|sorter|ordne/i))), numbersIn(first)]
  if (given.length < 2 || answer.length !== given.length) return false
  const sorted = [...given].sort((a, b) => (ascending ? a - b : b - a))
  return !sorted.every((v, i) => same(v, answer[i]))
}

/**
 * Påstander eleven vurderer: «A er mindre (større) enn B» og «A m er det samme som B cm» / «… er like lange».
 * Konklusjonen i fasiten (Ja/Nei) må stemme med påstanden.
 */
function claimProblem(studentText: string, solution: string): boolean {
  const conclusion = /^\s*(ja|nei)\b/i.exec(solution)?.[1].toLowerCase()
  if (!conclusion) return false
  const text = merge(studentText)
  const compare = new RegExp(String.raw`(${NUMBER})\s*${UNIT}?\s*(?:er|må være) (mindre|større|kortere|lengre) enn (${NUMBER})\s*${UNIT}?`, 'iu').exec(text)
  let truth: boolean | null = null
  if (compare) {
    const [a, b] = [toNumber(compare[1]) * (compare[2] ? UNIT_MM[short(compare[2])] : 1), toNumber(compare[4]) * (compare[5] ? UNIT_MM[short(compare[5])] : 1)]
    truth = /mindre|kortere/i.test(compare[3]) ? a < b : a > b
  } else if (/det samme som|like (lange?|langt)/i.test(text)) {
    const list = measuresIn(text)
    if (list.length === 2) truth = same(list[0].mm, list[1].mm)
  }
  return truth !== null && (conclusion === 'ja') !== truth
}

/** Fyll inn ett tomt felt: fasitens første tall satt inn i regnestykket må stemme («__ + 36 = 91» → 55). */
function blankProblem(studentText: string, solution: string): boolean {
  const blanks = studentText.match(/_{2,}|□/g)?.length ?? 0
  if (blanks !== 1) return false
  const equation = new RegExp(String.raw`(?:${NUMBER}|_{2,}|□)(?:\s*[+\-−·x×*:/]\s*(?:${NUMBER}|_{2,}|□))+\s*=\s*(?:${NUMBER}|_{2,}|□)`).exec(merge(studentText))
  const answer = firstNumber(solution)
  if (!equation || answer === undefined) return false
  const [left, right] = equation[0].replace(/_{2,}|□/, String(answer).replace('.', ',')).split('=')
  const [l, r] = [evaluate(left), evaluate(right)]
  return l !== null && r !== null && !same(l, r)
}

/** Regnestykker med ett regnetegn i en tekst: tallene i hvert stykke som en sortert «familie» («13,25,38»). */
const familiesIn = (text: string) =>
  [...merge(text).matchAll(new RegExp(String.raw`(?<![\d,])(${NUMBER})\s*[+\-−·x×*:/]\s*(${NUMBER})\s*=\s*(${NUMBER})(?!\s*[+\-−·x×*:/]\s*\d)`, 'g'))].map((m) =>
    [m[1], m[2], m[3]].map(toNumber).sort((a, b) => a - b).join(),
  )

/**
 * Sammenhengen mellom regneartene: oppgir oppgaveteksten ett regnestykke (25 + 13 = 38), skal regnestykkene i
 * fasiten bruke de samme tre tallene (38 − 13 = 25, 38 − 25 = 13).
 */
function sameFamilyProblem(studentText: string, solution: string): boolean {
  const given = new Set(familiesIn(studentText))
  if (given.size !== 1) return false
  return familiesIn(solution).some((family) => !given.has(family))
}

/** «Regn ut 302 − 158» / «Legg sammen …»: svaret på regnestykket i oppgaveteksten må stå i fasiten. */
function expressionAnswerProblem(studentText: string, solution: string): boolean {
  const m = new RegExp(String.raw`(?<![\d,=]\s*)(${NUMBER}(?:\s*[+\-−·x×*:/]\s*${NUMBER})+)(?!\s*(?:[+\-−·x×*:/]\s*\d|=|\d))`).exec(merge(studentText))
  if (!m || !/\b(regn ut|legg sammen|trekk fra|hva er|finn svaret)\b/i.test(studentText)) return false
  const value = evaluate(m[1])
  return value !== null && !numbersIn(solution).some((n) => same(n, value))
}

/**
 * Kontrollerer én AI-oppgave i en økt i Tall og regning. Rekkefølge: tall og skrivemåte (punktum, hundredeler,
 * negative tall, divisjon med 0), innhold utenfor temaet, tallområdet, figurer som ikke vises, nivået, fasit
 * (tomme felt, regnestykker, sammenligninger, rekkefølger, påstander) og til slutt kravene til fagområdet.
 */
export function numbersProblem(task: AiTaskDraft, { area, secondaryAreas = [] }: NumbersContext): NumbersProblem | null {
  const single = secondaryAreas.length === 0
  const relation = area === 'sammenheng-addisjon-subtraksjon' || area === 'sammenheng-multiplikasjon-divisjon'
  const pair = area === 'sammenheng-addisjon-subtraksjon' ? 'addition' : 'multiplication'
  const studentText = isMathDraft(task) ? task.instruction : task.studentText
  const solution = isMathDraft(task) ? '' : task.solution
  const all = `${studentText} ${solution}`

  if (DOT_DECIMAL.test(all)) return 'decimalFormat'
  if (HUNDREDTHS.test(all)) return 'tooManyDecimals'
  if (NEGATIVE.test(all)) return 'offTopic'
  if (DIVISION_BY_ZERO.test(all) || (isMathDraft(task) && task.operator === '/' && task.b === 0)) return 'divisionByZero'
  if (OUTSIDE_TOPIC.test(studentText)) return 'offTopic'
  if (relation && ANY_DECIMAL.test(all)) return 'offTopic'
  const limit = numberLimit(area, task.level, numbersAndOperationsReferences)
  const numbers = isMathDraft(task) ? [task.a, task.b] : digitsIn(all)
  if (numbers.some((n) => n > limit)) return 'outsideRange'
  if (!isMathDraft(task) && MISSING_FIGURE.test(studentText)) return 'missingFigure'

  // Nivået: ingen vurdering av andres svar på nivå 1, og resonnement på nivå 3.
  const assessment = !isMathDraft(task) && ASSESSMENT.test(studentText)
  if (task.level === 1 && assessment) return 'levelMismatch'
  if (task.level === 3 && !isMathDraft(task) && !REASONING.test(studentText) && !/to måter/i.test(studentText)) return 'levelMismatch'

  if (isMathDraft(task)) {
    // Regnestykket appen retter må høre til faktumet i instruksjonen («6 · 4 = 24. Bruk det til å finne 24 : 4.»).
    const told = familiesIn(task.instruction)
    if (told.length === 1 && !told[0].split(',').map(Number).includes(task.a)) return 'wrongSolution'
  } else {
    if (/\bsvar(et)? (er|blir)\s*\d/i.test(studentText) && !assessment) return 'revealedSolution'
    if (familyProblem(studentText, solution, pair)) return 'wrongSolution'
    // Divisjon i sammenhengsøkta skal gå opp (ingen rest) – før regnefamilien, så årsaken blir riktig.
    if (area === 'sammenheng-multiplikasjon-divisjon' && (explicitDivisions(all).some(([a, b]) => b > 0 && a % b !== 0) || REMAINDER_WORD.test(all))) return 'wrongRemainder'
    if (!assessment && blankProblem(studentText, solution)) return 'wrongSolution'
    if (!assessment && sameFamilyProblem(studentText, solution)) return 'wrongSolution'
    if (!assessment && expressionAnswerProblem(studentText, solution)) return 'wrongSolution'
    const toWrite = decimalToWrite(studentText)
    const answer = firstNumber(solution)
    if (toWrite !== null && (answer === undefined || !same(answer, toWrite))) return 'wrongSolution'
    const tenthsIn = /hvor mange tideler (?:er det )?i (\d+,\d)/i.exec(studentText)
    if (tenthsIn && (answer === undefined || !same(answer, Math.round(toNumber(tenthsIn[1]) * 10)))) return 'wrongSolution'
    if (comparisonProblem(studentText, solution) || orderProblem(studentText, solution)) return 'wrongSolution'
    if (claimProblem(studentText, solution)) return 'wrongConclusion'
  }

  // Divisjon i sammenhengsøkta skal gå opp (ingen rest).
  if (area === 'sammenheng-multiplikasjon-divisjon') {
    const divisions: [number, number][] = isMathDraft(task) ? (task.operator === '/' ? [[task.a, task.b]] : []) : explicitDivisions(all)
    if (divisions.some(([a, b]) => b > 0 && a % b !== 0) || REMAINDER_WORD.test(all)) return 'wrongRemainder'
  }

  // Lengder: enhet i oppgaven og i fasiten, riktige omgjøringer og samme enhet når lengder sammenlignes.
  if (area === 'desimaltall-lengde' && !isMathDraft(task)) {
    if (measuresIn(solution).length === 0) return 'missingUnit'
    if (conversionErrors(solution) || (!assessment && conversionErrors(studentText))) return 'wrongConversion'
    const target = targetUnit(studentText)
    const length = lengthToConvert(studentText)
    if (target && length !== null && !assessment) {
      const given = measuresIn(solution)[0]
      if (given.unit !== target || !same(given.mm, length)) return 'wrongConversion'
    }
    if (/\b(lengst|kortest|lengre|kortere|sorter|ordne|rekkefølge|sammenlign)/i.test(studentText) && missingCommonUnit(studentText, solution)) return 'wrongConversion'
  }

  if (!single) return null
  if (area === 'sammenheng-addisjon-subtraksjon' || area === 'sammenheng-multiplikasjon-divisjon') {
    if (!showsRelation(task, pair)) return 'missingRelation'
  }
  if (area === 'desimaltall-tideler') {
    if (isMathDraft(task) || !(ANY_DECIMAL.test(all) || /tidel/i.test(all))) return 'wrongArea'
    if (measuresIn(studentText).length > 0) return 'wrongArea'
  }
  if (area === 'desimaltall-lengde') {
    if (isMathDraft(task) || measuresIn(studentText).length === 0 && !UNIT_WORD.test(studentText)) return 'wrongArea'
  }
  return null
}
