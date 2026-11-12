import { isMathDraft, type AiTaskDraft, type DivisionStrategiesArea, type DivisionType } from '../src/ai/contract.ts'
import {
  DECIMAL,
  DIVISION_BY_ZERO,
  DIVISION_SIGNAL,
  NEGATIVE,
  REMAINDER_WORD,
  divisionOf,
  divisionTypeConflict,
  explicitDivisions,
  partsTypeConflict,
} from './divisionChecks.ts'
import { CLAIM, MISSING_FIGURE } from './geometryChecks.ts'
import { REASONING, numberLimit } from './problemSolvingChecks.ts'
import { divisionStrategiesReferences } from './references/divisionStrategies.ts'

// Faglige kontroller for AI-oppgaver i Strategier i divisjon. Som i Divisjon: delestykkene leses og regnes ut, og
// ordsøk brukes bare til å finne hva oppgaven spør om eller hvilken strategi den bruker. Delestykker, divisjon på 0,
// rest og divisjonstype kontrolleres med funksjonene fra Divisjon (divisionChecks.ts). Fasiten i regnestykkene
// (a : b = c) kontrolleres for alle tema i taskChecks.ts. Kontrollene gjelder alltid – også med «Andre ønsker».

/** Hvorfor en oppgave i Strategier i divisjon ikke kan brukes. */
export type StrategiesProblem =
  | 'offTopic'
  | 'wrongArea'
  | 'wrongSolution'
  | 'wrongConclusion'
  | 'wrongRemainder'
  | 'divisionByZero'
  | 'wrongDivisionType'
  | 'invalidStrategy'
  | 'wrongRelation'
  | 'missingRelation'
  | 'missingPlaceValue'
  | 'missingUnit'
  | 'missingInfo'
  | 'outsideRange'
  | 'levelMismatch'
  | 'missingFigure'
  | 'revealedSolution'

export interface StrategiesContext {
  area: DivisionStrategiesArea
  secondaryAreas?: readonly DivisionStrategiesArea[]
  /** Divisjonstypen oppgaven skal ha (referansene i banken har den; AI-oppgaver har den ikke). */
  divisionType?: DivisionType | 'begge'
}

const merge = (text: string) => text.replace(/(\d) (?=\d{3}\b)/g, '$1')
const digitsIn = (text: string) => (merge(text).match(/\d+/g) ?? []).map(Number)
const sentences = (text: string) => text.split(/(?<=[.?!])\s+|\n+/).filter((s) => s.trim())

/** Eleven vurderer en påstand eller finner en feil – feilen i oppgaveteksten er meningen. */
const REVIEW = new RegExp(`${CLAIM.source}|har (\\p{L}+ )?glemt|gjort feil|hva er feil|finn feil|regner \\p{L}+ slik|regner slik`, 'iu')
/** Eleven skal lage noe selv (fortelling): fasiten er en beskrivelse. */
const CREATE = /\blag\b|regnefortelling/i
const BLANK = /_{2,}|□/

// ---------------------------------------------------------------------------------------------
// Brøker: «1/4», «en fjerdedel», «to tredjedeler», «halvparten».

const FRACTION_DENOMINATORS: Record<string, number> = {
  halvdel: 2, halvpart: 2, tredjedel: 3, fjerdedel: 4, femtedel: 5, sjettedel: 6, sjudedel: 7, syvendedel: 7, åttedel: 8, niendedel: 9, tidel: 10,
}
const NUMERATORS: Record<string, number> = { en: 1, ei: 1, ett: 1, én: 1, to: 2, tre: 3, fire: 4, fem: 5 }
const FRACTION_WORD = new RegExp(
  String.raw`(?<![\p{L}])(?:(en|ei|ett|én|to|tre|fire|fem)\s+)?(${Object.keys(FRACTION_DENOMINATORS).join('|')})(?:en|er|ene)?(?![\p{L}])`,
  'giu',
)
/** «1/4» uten mellomrom (et delestykke skrives «a : b»). */
const FRACTION_NUMBER = /(?<![\d/,])([1-9])\/(\d{1,2})(?![\d/])/g
const HAS_FRACTION_NUMBER = new RegExp(FRACTION_NUMBER.source)

interface Fraction {
  numerator: number
  denominator: number
  index: number
  end: number
}

function fractionsIn(text: string): Fraction[] {
  const words = [...text.matchAll(FRACTION_WORD)].map((m) => ({
    numerator: m[1] ? NUMERATORS[m[1].toLowerCase()] : 1,
    denominator: FRACTION_DENOMINATORS[m[2].toLowerCase()],
    index: m.index!,
    end: m.index! + m[0].length,
  }))
  const numbers = [...text.matchAll(FRACTION_NUMBER)].map((m) => ({ numerator: Number(m[1]), denominator: Number(m[2]), index: m.index!, end: m.index! + m[0].length }))
  return [...words, ...numbers].sort((a, b) => a.index - b.index)
}

/** Teksten uten brøker skrevet med tall – så «1/4» ikke leses som delestykket 1 : 4. */
const withoutFractions = (text: string) => text.replace(FRACTION_NUMBER, ' brøk ')

/** Brøken med ord og med tall må være den samme: «en fjerdedel (1/4)», «En fjerdedel, 1/4». */
function fractionPairProblem(text: string): boolean {
  const pair = new RegExp(String.raw`(${FRACTION_WORD.source})\s*(?:\(\s*|,\s*|\s+(?:=|eller|som)\s+)([1-9])\/(\d{1,2})`, 'giu')
  return [...text.matchAll(pair)].some((m) => {
    const word = fractionsIn(m[1])[0]
    return !!word && (word.numerator !== Number(m[4]) || word.denominator !== Number(m[5]))
  })
}

const LENGTH = /(\d+)\s*(km|m|dm|cm|mm|meter|centimeter|desimeter|millimeter)(?![\p{L}])/iu
/** Én gjenstand som deles: «En pizza deles i 4 …», «Et tau er 20 m langt». */
const ONE_THING = /(?<![\p{L}])(en|ei|et|én|ett)\s+\p{L}+\s+(deles|er delt|blir delt|skal deles|er \d+\s*(km|m|dm|cm|mm)\b)/iu
const PIECES = /(?:deles|delt|deler)\s+(?:\p{L}+\s+)?i\s+(\d+)\s+(like store |like lange |like )?(biter|deler|stykker|grupper|bunker)/iu
/** Mange ting som deles i grupper: «24 kjeks», «12 kuler» (ikke lengder). */
const COUNTED_SET = /(?<![\d/])(\d+)\s+(?!km\b|m\b|dm\b|cm\b|mm\b|meter|like|grupper|deler|biter|stykker)\p{L}{3,}/iu
const ASKS_PART = /hvor stor del|hvilken brøk|skriv (svaret )?(som|med) brøk|som brøk/i

/** Delene i en oppgave med to deler («A: …», «B: …»), ellers hele teksten. Fasiten deles på samme måte. */
function partsOf(text: string): Map<string, string> {
  const marks = [...text.matchAll(/(?:^|\n|\s)([A-D])[:)]\s/g)]
  if (marks.length < 2) return new Map([['', text]])
  return new Map(marks.map((m, i) => [m[1], text.slice(m.index!, marks[i + 1]?.index ?? text.length)]))
}

/** Hel eller mengde ut fra teksten i delen (null når det ikke er tydelig). */
function wholeOrSet(part: string): 'hel' | 'mengde' | null {
  const one = ONE_THING.test(part) || LENGTH.test(part)
  const set = COUNTED_SET.test(withoutFractions(part).replace(LENGTH, ''))
  return one === set ? null : one ? 'hel' : 'mengde'
}

/**
 * Del av en hel og del av en mengde:
 * - teller 1 (teller 2 bare på nivå 3), og brøken med ord og tall må være den samme
 * - «en tredjedel av 12» / «1/3 av kulene» (med 12 kuler): mengden må gå opp i nevneren, og svaret stemme
 * - «Hvor stor del …»: svaret er en brøk; deles en hel i n like store deler, er nevneren n
 * - en lengde som hel: svaret har enhet
 * - én gjenstand som deles i deler: delene må være like store
 * - fasiten sier «del av en hel» eller «del av en mengde» om en del: det må passe teksten
 */
function fractionProblem(task: AiTaskDraft, level: number): StrategiesProblem | null {
  const studentText = isMathDraft(task) ? task.instruction : task.studentText
  const solution = isMathDraft(task) ? '' : task.solution
  const all = `${studentText} ${solution}`
  const fractions = fractionsIn(all)
  if (fractions.length === 0 && !/brøk/i.test(all)) return ASKS_PART.test(studentText) ? 'wrongSolution' : 'wrongArea'
  if (fractions.some((f) => f.numerator > 2 || (f.numerator === 2 && level < 3) || f.numerator >= f.denominator)) return 'levelMismatch'
  if (fractionPairProblem(all)) return 'wrongSolution'

  // «en femtedel (1/5) av 40»: mengden går opp i nevneren, og svaret er antall.
  const ofNumber = new RegExp(String.raw`(${FRACTION_WORD.source}|[1-9]\/\d{1,2})(?:\s*\([^)]*\))?\s+av\s+(?:de\s+)?(\d+)`, 'giu')
  const parts: { fraction: Fraction; total: number; text: string }[] = []
  for (const m of merge(all).matchAll(ofNumber)) {
    const fraction = fractionsIn(m[1])[0]
    if (fraction) parts.push({ fraction, total: Number(m.at(-1)), text: m[0] })
  }
  if (isMathDraft(task)) {
    const asked = parts[0]
    if (!asked || asked.total !== task.a || asked.fraction.denominator !== task.b || asked.fraction.numerator !== 1) return 'wrongSolution'
    return null
  }
  if (parts.some((p) => p.total % p.fraction.denominator !== 0)) return 'wrongRemainder'
  // Påstander i fasiten: «En fjerdedel av 20 er 5».
  const statements = new RegExp(String.raw`(${FRACTION_WORD.source}|[1-9]\/\d{1,2})(?:\s*\([^)]*\))?\s+av\s+(?:de\s+)?(\d+)\s+(?:\p{L}+\s+)?(?:er|blir)\s+(\d+)`, 'giu')
  for (const m of merge(solution).matchAll(statements)) {
    const f = fractionsIn(m[1])[0]
    const [total, said] = [Number(m.at(-2)), Number(m.at(-1))]
    if (f && (total / f.denominator) * f.numerator !== said) return 'wrongSolution'
  }

  const review = REVIEW.test(studentText)
  const solutionParts = partsOf(solution)
  for (const [letter, part] of partsOf(studentText)) {
    const answer = solutionParts.get(letter) ?? solution
    const kind = wholeOrSet(part)
    const said = /del av en hel/i.test(answer) ? 'hel' : /del av en mengde/i.test(answer) ? 'mengde' : null
    if (kind && said && kind !== said) return 'wrongArea'
    // Én gjenstand som deles i deler: delene er like store.
    const pieces = PIECES.exec(part)
    if (ONE_THING.test(part) && pieces && !pieces[2] && !/like (store|lange)|likt/i.test(part)) return 'missingInfo'
    if (review) continue
    const question = sentences(part).filter((s) => s.includes('?')).join(' ')
    // Del av en mengde («Det er 12 kuler. En tredjedel (1/3) av kulene …»): ett tall i teksten er hele mengden.
    const own = parts.filter((p) => part.includes(p.text))
    const fraction = fractionsIn(part)[0]
    if (/hvor mange|hvor lang/i.test(question) && fraction && own.length === 0 && /\bav\s+(de\s+|den\s+)?\p{L}+/iu.test(part)) {
      const others = digitsIn(withoutFractions(part).replace(/\(\s*brøk\s*\)/g, ''))
      if (others.length === 1) {
        const total = others[0]
        if (total % fraction.denominator !== 0) return 'wrongRemainder'
        if (!digitsIn(answer).includes((total / fraction.denominator) * fraction.numerator)) return 'wrongSolution'
      }
    }
    for (const p of own) {
      if (/hvor mange|hvor lang|hva er/i.test(question) && !digitsIn(answer).includes((p.total / p.fraction.denominator) * p.fraction.numerator)) return 'wrongSolution'
    }
    // En lengde som hel: svaret har enhet.
    if (LENGTH.test(part) && /hvor (mange (meter|centimeter|desimeter|millimeter|km|m|dm|cm|mm)\b|lang)/i.test(question) && !LENGTH.test(answer)) return 'missingUnit'
    // «Hvor stor del …»: svaret er en brøk, og nevneren er antall like store deler.
    if (ASKS_PART.test(question)) {
      const given = fractionsIn(answer)[0]
      if (!given) return 'wrongSolution'
      if (pieces && /\b(én|ett|en|ei|1) (bit|stykke|del)\b/i.test(question) && given.denominator !== Number(pieces[1])) return 'wrongSolution'
    }
    // «Hvilken er størst: en tredjedel (1/3) eller en femtedel (1/5)?» – den med færrest like deler.
    const compared = fractionsIn(part)
    const asks = /\b(størst|minst)\b/i.exec(question)
    if (asks && compared.length === 2 && compared.every((f) => f.numerator === 1)) {
      const first = fractionsIn(answer)[0]
      const bigger = Math.min(compared[0].denominator, compared[1].denominator)
      const target = /størst/i.test(asks[1]) ? bigger : Math.max(compared[0].denominator, compared[1].denominator)
      if (!first || first.denominator !== target) return 'wrongSolution'
    }
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Oppdeling: «Del 52 i 40 og 12», «400 : 4 = 100, 80 : 4 = 20 …», «120 + 36 gir 20 + 6».

/**
 * Oppdelingen av et delestykke total : divisor må være riktig: delene går opp i tallet vi deler på, og de er til
 * sammen tallet som deles (eller et helt antall ganger tallet når oppgaven viser flere oppdelinger). Avviser
 * løsninger der plassverdien forsvinner (96 : 3 som 9 : 3 og 6 : 3). I vurderingsoppgaver telles ikke delene eleven
 * skal vurdere (de står i oppgaveteksten).
 */
function partitionProblem(studentText: string, solution: string, total: number, divisor: number, review: boolean): StrategiesProblem | null {
  const quoted = new Set(explicitDivisions(withoutFractions(studentText)).map(([a, b]) => `${a}:${b}`))
  const parts = explicitDivisions(withoutFractions(solution))
    .filter(([a, b]) => b === divisor && a < total)
    .filter(([a, b]) => !review || !quoted.has(`${a}:${b}`))
    .map(([a]) => a)
  if (parts.length >= 2) {
    const sum = parts.reduce((x, y) => x + y, 0)
    if (sum % total !== 0) return 'wrongSolution'
  }
  // «120 + 36 gir 20 + 6»: hver del går opp, og svarene på delene hører til delene.
  for (const m of merge(solution).matchAll(/(\d+(?:\s*\+\s*\d+)+)\s+(?:gir|blir)\s+(\d+(?:\s*\+\s*\d+)+)/g)) {
    const given = m[1].split('+').map((x) => Number(x.trim()))
    const results = m[2].split('+').map((x) => Number(x.trim()))
    if (given.reduce((x, y) => x + y, 0) !== total) return 'wrongSolution'
    if (given.length !== results.length || given.some((g, i) => g % divisor !== 0 || g / divisor !== results[i])) return 'wrongSolution'
  }
  // «Del 52 i 40 og 12»: delene er til sammen tallet og går opp.
  const told = new RegExp(String.raw`\bdel\w*\s+${total}\s+i\s+((?:\d+\s*(?:,|og)\s*)+\d+)`, 'i').exec(merge(studentText))
  if (told) {
    const given = told[1].split(/,|og/).map((x) => Number(x.trim()))
    if (given.reduce((x, y) => x + y, 0) !== total || given.some((g) => g % divisor !== 0)) return 'wrongSolution'
  }
  return null
}

/** Delestykket i «Del 36 på 4 …», ellers som i Divisjon (ett «a : b» eller de to tallene i situasjonen). */
function mainDivision(studentText: string): { total: number; divisor: number } | null {
  const told = /\bdel\w*\s+(\d+)\s+(?:på|med)\s+(\d+)\b/i.exec(merge(studentText))
  if (told && Number(told[2]) > 0) return { total: Number(told[1]), divisor: Number(told[2]) }
  return divisionOf(withoutFractions(studentText))
}

/**
 * Det største delestykket i teksten for hvert tall vi deler på («Regn ut 369 : 3. Fyll inn: 300 : 3 = __ …» → 369 : 3).
 * Stykker med oppgitt svar («36 : 6 = 6. Hva er 36 : 3?») er kjente fakta, ikke det eleven skal finne.
 */
function largestDivisions(studentText: string): { total: number; divisor: number }[] {
  const largest = new Map<number, number>()
  for (const [, x, y] of merge(withoutFractions(studentText)).matchAll(/(\d+)\s*:\s*(\d+)(?!\d)(?!\s*=\s*\d)/g)) {
    const [a, b] = [Number(x), Number(y)]
    if (b > 0 && a % b === 0 && a > (largest.get(b) ?? 0)) largest.set(b, a)
  }
  return [...largest].map(([divisor, total]) => ({ total, divisor }))
}

/**
 * Oppdeling uten et delestykke i oppgaveteksten («Fire klasser deler 484 ark likt»): delene i fasiten med samme tall vi
 * deler på må til sammen være et tall i oppgaven (eller den største delen er summen av de andre: 96 : 3 = 32 ved siden av
 * 90 : 3 og 6 : 3). Avviser 9 : 3 og 6 : 3 for 96 : 3, der plassverdien forsvinner.
 */
function looseParts(studentText: string, solution: string): boolean {
  const given = new Set(digitsIn(studentText))
  const answers = new Set(digitsIn(solution))
  const groups = new Map<number, number[]>()
  for (const [a, b] of explicitDivisions(withoutFractions(solution))) groups.set(b, [...(groups.get(b) ?? []), a])
  return [...groups].some(([divisor, parts]) => {
    if (parts.length < 2) return false
    const sorted = [...new Set(parts)].sort((x, y) => y - x)
    const rest = sorted.slice(1).reduce((x, y) => x + y, 0)
    if (sorted[0] === rest) return false
    const total = sorted.reduce((x, y) => x + y, 0)
    // Delene er til sammen tallet i oppgaven, og svaret (tallet delt på divisoren) står i fasiten.
    return !given.has(total) || !answers.has(total / divisor)
  })
}

// ---------------------------------------------------------------------------------------------
// Halvering: å dele på 2, 4 og 8 (én, to eller tre halveringer).

const HALVING = /halver\w*|halvering\w*/i
const HALVING_COUNT = /halver\w*\s+(to|tre|2|3)\s+ganger|(to|tre|2|3)\s+halveringer|halvering(?:er)?\s+(to|tre|2|3)\s+ganger/i
const COUNT_WORDS: Record<string, number> = { to: 2, tre: 3, '2': 2, '3': 3 }

/** Halvering i instruksjonen må passe tallet vi deler på: 2, 4 eller 8 – og antall halveringer må stemme. */
function halvingProblem(instruction: string, divisor: number): boolean {
  if (!HALVING.test(instruction)) return false
  if (sentences(instruction).some((s) => HALVING.test(s) && /\bikke\b/i.test(s))) return false
  if (![2, 4, 8].includes(divisor)) return true
  const count = HALVING_COUNT.exec(instruction)
  if (!count) return false
  const n = COUNT_WORDS[(count[1] ?? count[2] ?? count[3]).toLowerCase()]
  return 2 ** n !== divisor
}

/**
 * Halveringskjeder i fasiten («84, 42, 21»): hvert tall er halvparten av det forrige, og kjeden passer et delestykke
 * i oppgaven med samme tall som deles (antall halveringer gir tallet vi deler på).
 */
function halvingChainProblem(all: string, solution: string, divisions: [number, number][]): boolean {
  if (!HALVING.test(all)) return false
  for (const [chain] of merge(solution).matchAll(/\d+(?:,\s*\d+)+/g)) {
    const list = chain.split(',').map((x) => Number(x.trim()))
    const matching = divisions.filter(([a]) => a === list[0])
    if (matching.length === 0) continue
    if (list.slice(1).some((v, i) => v * 2 !== list[i])) return true
    if (!matching.some(([a, b]) => 2 ** (list.length - 1) === b && a / b === list.at(-1))) return true
  }
  return false
}

// ---------------------------------------------------------------------------------------------
// Sammenhenger i divisjon: hva som skjer med svaret når tallene endres.

const DIVIDEND = /tallet (som|vi) (skal )?del(es|er)\b(?!\s+(på|med)\b)|det som deles|tallet som skal deles|mye å dele|mengden|dividenden/i
const DIVISOR = /tallet (vi|jeg|du|man|hun|han) deler (på|med)|divisoren|(antall|mange|færre|flere) grupper/i
const BOTH = /begge tallene/i
const UP = /dobl\w*|dobbelt|ti ganger|tidobl\w*|tredobl\w*|større|flere|mer\b/i
const DOWN = /halv\w*|halvparten|mindre|færre/i
const SAME = /samme|likt?\b|uendret/i
const EFFECT = /\bsvaret\b|\bi hver\b|\bsamme svar\b/i

type Change = 'up' | 'down' | 'same'

/**
 * Sammenhengen en setning beskriver, eller null når setningen ikke beskriver én: årsaken (tallet som deles, tallet vi
 * deler på eller begge, og om det blir større eller mindre) og virkningen på svaret.
 */
function relationIn(sentence: string): { correct: boolean } | null {
  const clauses = sentence.split(/,\s*|\s+og\s+da\s+|\s+(?=når\b)/i)
  const effectIndex = clauses.findIndex((c) => EFFECT.test(c))
  if (effectIndex < 0) return null
  const effect = clauses[effectIndex].replace(EFFECT, ' ')
  const cause = clauses.filter((_, i) => i !== effectIndex).join(' ')
  const subject = BOTH.test(cause) ? 'both' : DIVISOR.test(cause) ? 'divisor' : DIVIDEND.test(cause) ? 'dividend' : null
  if (!subject) return null
  const causeText = cause.replace(DIVISOR, ' ').replace(DIVIDEND, ' ')
  const change: Change | null = UP.test(causeText) ? 'up' : DOWN.test(causeText) ? 'down' : null
  const result: Change | null = SAME.test(effect) ? 'same' : UP.test(effect) ? 'up' : DOWN.test(effect) ? 'down' : null
  if (!result || (subject !== 'both' && !change)) return null
  const expected: Change = subject === 'both' ? 'same' : subject === 'dividend' ? change! : change === 'up' ? 'down' : 'up'
  return { correct: expected === result }
}

/** Påstanden noen kommer med i oppgaveteksten: i «…», eller etter «sier at». */
function claimOf(studentText: string): string | null {
  const quoted = /«([^»]+)»/.exec(studentText)
  if (quoted) return quoted[1]
  const said = /\b(?:sier|mener|tror|påstår)(?: at)?:?\s+([^.?!]+)/i.exec(studentText)
  return said ? said[1] : null
}

/** «12 : 2, 24 : 4 og 36 : 6 gir alle 6», «18 : 2 gir 9»: delestykkene må gi tallet. */
function givesProblem(text: string): boolean {
  const pattern = /((?:\d+\s*:\s*\d+(?:\s*,\s*|\s+og\s+))*\d+\s*:\s*\d+)\s+(?:gir|blir)\s+(?:alle\s+|begge\s+)?(\d+)/g
  return [...merge(text).matchAll(pattern)].some((m) => explicitDivisions(m[1]).some(([a, b]) => b !== 0 && a / b !== Number(m[2])))
}

/**
 * Delestykkene eleven skal regne ut («Regn ut 84 : 4», «Hva er 24 : 3?», «Bruk dette til å finne 70 : 5 og 350 : 5»)
 * må ha svaret sitt i fasiten. Stykker med oppgitt svar («35 : 5 = 7») er gitt, ikke spurt om.
 */
function askedAnswerProblem(studentText: string, solution: string): boolean {
  const answers = new Set(digitsIn(solution))
  return sentences(withoutFractions(studentText))
    .filter((s) => /\b(regn ut|hva er|hva blir|finne?)\b/i.test(s))
    .some((s) =>
      [...merge(s).matchAll(/(\d+)\s*:\s*(\d+)(?!\s*\d)(?!\s*=)/g)].some(([, a, b]) => Number(b) > 0 && Number(a) % Number(b) === 0 && !answers.has(Number(a) / Number(b))),
    )
}

// ---------------------------------------------------------------------------------------------
// Dividere med 10 og 100.

const PLACE_VALUE = /\btier(e|ne)?\b|\bhundrer(e|ne)?\b|\btikron\w*|\bhundrelapp\w*|\btusen(er|ere)?\b/i
/** Regler uten plassverdi: «stryk en null», «fjern nullene», «flytt kommaet», «hva skjer med sifrene». */
const RULE = /\bstryk\w*|\bstrøk\b|\b(fjern|ta bort|tar bort)\w*\s+(en |to |de |den )?null\w*|\bflytt\w*\s+(sifrene|kommaet|komma)|\bkomma\w*\s+flytt\w*|hva skjer med sifrene|sifrene flytt\w*/i

// ---------------------------------------------------------------------------------------------

/**
 * Kontrollerer én AI-oppgave i en økt i Strategier i divisjon. Rekkefølge: tall som ikke hører til (desimaltall,
 * negative tall, divisjon på 0), rest, innhold utenfor temaet, tallområdet, figurer som ikke vises, nivået, fasit
 * (svar på spurte delestykker, «gir»-påstander), divisjonstypen (som i Divisjon) og til slutt kravene til fagområdet.
 */
export function strategiesProblem(task: AiTaskDraft, { area, secondaryAreas = [], divisionType }: StrategiesContext): StrategiesProblem | null {
  const single = secondaryAreas.length === 0
  const fractionArea = area === 'del-av-hel-mengde' || secondaryAreas.includes('del-av-hel-mengde')
  const studentText = isMathDraft(task) ? task.instruction : task.studentText
  const solution = isMathDraft(task) ? '' : task.solution
  const all = `${studentText} ${solution}`
  const plain = withoutFractions(all)

  if (isMathDraft(task)) {
    if (task.operator !== '/') return 'offTopic'
    if (task.b === 0) return 'divisionByZero'
    if (task.a % task.b !== 0) return 'wrongRemainder'
  }
  if (DIVISION_BY_ZERO.test(plain)) return 'divisionByZero'
  if (DECIMAL.test(all) || NEGATIVE.test(all) || /\bkomma\b|desimal/i.test(studentText)) return 'offTopic'
  const divisions = explicitDivisions(plain)
  if (divisions.some(([, b]) => b === 0)) return 'divisionByZero'
  // Alle delestykkene i temaet går opp. Divisjon med noe til overs hører til Divisjon.
  if (divisions.some(([a, b]) => a % b !== 0) || REMAINDER_WORD.test(all)) return 'wrongRemainder'
  // Brøker hører bare til del av en hel og del av en mengde.
  if (!fractionArea && (HAS_FRACTION_NUMBER.test(all) || /\bbrøk/i.test(all))) return 'offTopic'
  if (/\bvinkel|\bareal\b|\bomkrets|\bprosent/i.test(studentText)) return 'offTopic'
  const limit = numberLimit(area, task.level, divisionStrategiesReferences)
  const numbers = isMathDraft(task) ? [task.a, task.b] : digitsIn(all)
  if (numbers.some((n) => n > limit)) return 'outsideRange'
  if (!isMathDraft(task) && MISSING_FIGURE.test(studentText)) return 'missingFigure'

  // Nivået: ingen vurdering av andres svar på nivå 1, og resonnement på nivå 3.
  const review = !isMathDraft(task) && REVIEW.test(studentText)
  if (task.level === 1 && review) return 'levelMismatch'
  if (task.level === 3 && !isMathDraft(task) && !review && !REASONING.test(studentText) && !BLANK.test(studentText) && !/to (ulike )?måter|vis begge|\blag\b/i.test(studentText)) {
    return 'levelMismatch'
  }

  // Delestykket oppgaven handler om: regnestykket, «Del 36 på 4», ett «a : b» i teksten eller de to tallene i situasjonen.
  const main = isMathDraft(task) ? { total: task.a, divisor: task.b } : mainDivision(task.studentText)
  // Oppgaven handler om divisjon: et ord eller tegn for deling, et tomt felt, tiere og hundrere, en brøk – eller en fasit
  // som er svaret på delestykket i situasjonen («Du har 30 kr. En is koster 6 kr. Hvor mange is …» → 5).
  const answersDivision = !!main && !isMathDraft(task) && main.total % main.divisor === 0 && digitsIn(task.solution).includes(main.total / main.divisor)
  if (!isMathDraft(task) && !answersDivision && !DIVISION_SIGNAL.test(studentText) && !BLANK.test(studentText) && !PLACE_VALUE.test(studentText) && fractionsIn(studentText).length === 0) {
    return 'offTopic'
  }
  if (!isMathDraft(task)) {
    if (/\bsvar(et)? (er|blir)\s*\d/i.test(studentText) && !review) return 'revealedSolution'
    if (givesProblem(solution) || askedAnswerProblem(studentText, solution)) return 'wrongSolution'
    // Svaret på delestykkene oppgaven handler om må stå i fasiten (ikke når eleven lager fortellinger selv).
    // Uten ett tydelig delestykke er det største delestykket med hvert tall vi deler på, det oppgaven handler om.
    const mains = main ? [main] : largestDivisions(task.studentText)
    if (!CREATE.test(studentText) && !fractionArea && mains.some((m) => !digitsIn(solution).includes(m.total / m.divisor))) return 'wrongSolution'
    // Divisjonstypen (som i Divisjon): spørsmål og fasit er enige – i oppgaver med to deler (A og B) for hver del.
    const expected = divisionType === 'deling' || divisionType === 'maling' ? divisionType : undefined
    if (partsOf(studentText).size > 1 ? partsTypeConflict(studentText, solution) : divisionTypeConflict(studentText, `${solution} ${task.adaptation}`, expected)) {
      return 'wrongDivisionType'
    }
    // Oppdeling (plassverdi og gode delestrategier): delene går opp og er til sammen tallet som deles.
    if (area === 'plassverdi-deling' || area === 'gode-delestrategier') {
      for (const m of mains) {
        const problem = partitionProblem(task.studentText, task.solution, m.total, m.divisor, review)
        if (problem) return problem
      }
      if (mains.length === 0 && looseParts(task.studentText, task.solution)) return 'wrongSolution'
    }
  }

  // Halvering passer bare når vi deler på 2, 4 eller 8 – og kjeden i fasiten må stemme.
  if (main && halvingProblem(studentText, main.divisor)) return 'invalidStrategy'
  if (!isMathDraft(task) && halvingChainProblem(all, solution, [...divisions, ...(main ? [[main.total, main.divisor] as [number, number]] : [])])) return 'wrongSolution'

  // Sammenhenger: beskrivelsen må være riktig, og konklusjonen om en påstand må stemme.
  if (!isMathDraft(task)) {
    for (const s of sentences(solution)) {
      if (/\bikke\b|\bfeil\b|\btror\b|\bsier\b|\bmener\b/i.test(s)) continue
      if (relationIn(s)?.correct === false) return 'wrongRelation'
    }
    const claim = claimOf(studentText)
    const relation = claim ? relationIn(claim) : null
    const conclusion = /^\s*(ja|nei)\b/i.exec(solution)?.[1].toLowerCase()
    if (relation && conclusion && (conclusion === 'ja') !== relation.correct) return 'wrongConclusion'
  }

  // Dividere med 10 og 100: forklaring med tiere og hundrere – ikke bare regler som «stryk en null».
  if (area === 'dividere-10-100' || secondaryAreas.includes('dividere-10-100')) {
    if (RULE.test(isMathDraft(task) ? task.instruction : review ? solution : all) && !PLACE_VALUE.test(isMathDraft(task) ? task.instruction : solution)) return 'missingPlaceValue'
    if (/flytt\w*\s+komma|komma\w*\s+flytt/i.test(all)) return 'missingPlaceValue'
  }

  if (fractionArea && (single || fractionsIn(all).length > 0)) {
    const problem = fractionProblem(task, task.level)
    if (problem) return problem
  }

  if (!single) return null
  if (area === 'dividere-10-100') {
    const divisors = isMathDraft(task) ? [task.b] : [...divisions.map(([, b]) => b), ...(main ? [main.divisor] : [])]
    if (!divisors.some((b) => b === 10 || b === 100) && !/hvor mange (tiere|hundrere|tikroner|hundrelapper)/i.test(studentText) && !BLANK.test(studentText)) return 'wrongArea'
    if (!PLACE_VALUE.test(all)) return 'missingPlaceValue'
  }
  if (area === 'sammenhenger-divisjon') {
    if (isMathDraft(task)) {
      // Instruksjonen gir et kjent delestykke som hører sammen med regnestykket (samme tall som deles, samme tall vi
      // deler på eller samme svar).
      const told = explicitDivisions(task.instruction).filter(([a, b]) => a !== task.a || b !== task.b)
      if (!told.some(([a, b]) => b === task.b || a === task.a || a / b === task.a / task.b)) return 'missingRelation'
    } else if (divisions.length < 2 && !/dobbelt|halvparten|ti ganger|samme svar|mønster|sammenheng/i.test(all)) {
      return 'missingRelation'
    }
  }
  return null
}
