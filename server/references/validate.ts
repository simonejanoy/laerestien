import { DIVISION_AREAS, GEOMETRY_AREAS, MULTIPLICATION_AREAS, NUMBERS_AND_OPERATIONS_AREAS, PLACE_VALUE_AREAS, PROBLEM_SOLVING_AREAS } from '../../src/ai/contract.ts'
import type { ReferenceBank, ReferenceTask } from './types.ts'

// Kontroll av referansebankene. Kjøres når serveren starter (multiplication.ts, placeValue.ts, division.ts, geometry.ts,
// problemSolving.ts, numbersAndOperations.ts) og i testene.

/** Hva en bank skal inneholde: tema, ID-prefiks (M1-N1-01, T1-N1-01) og fagområdene i rekkefølge. */
export interface BankSpec {
  topic: string
  idPrefix: string
  areas: readonly string[]
}

export const MULTIPLICATION_BANK: BankSpec = { topic: 'multiplikasjon', idPrefix: 'M', areas: MULTIPLICATION_AREAS }
export const PLACE_VALUE_BANK: BankSpec = { topic: 'tall-og-plassverdi', idPrefix: 'T', areas: PLACE_VALUE_AREAS }
export const DIVISION_BANK: BankSpec = { topic: 'divisjon', idPrefix: 'D', areas: DIVISION_AREAS }
export const GEOMETRY_BANK: BankSpec = { topic: 'geometri', idPrefix: 'G', areas: GEOMETRY_AREAS }
export const PROBLEM_SOLVING_BANK: BankSpec = { topic: 'problemlosing', idPrefix: 'P', areas: PROBLEM_SOLVING_AREAS }
export const NUMBERS_AND_OPERATIONS_BANK: BankSpec = { topic: 'tall-og-regning', idPrefix: 'TR', areas: NUMBERS_AND_OPERATIONS_AREAS }
const REQUIRED_TEXT = ['id', 'topic', 'area', 'areaTitle', 'title', 'format', 'purpose', 'studentText', 'solution'] as const

export interface BankCheck {
  errors: string[]
  /** Antall regnestykker og likninger som ble kontrollert maskinelt. */
  checkedEquations: number
}

// ---------------------------------------------------------------------------------------------
// Utregning av enkle uttrykk: hele tall, + − x · * : / og parenteser.

type Token = number | string

function tokenize(expression: string): Token[] | null {
  const tokens: Token[] = []
  const source = expression.replace(/\s+/g, '')
  for (let i = 0; i < source.length; ) {
    const digits = /^\d+(?:,\d+)?/.exec(source.slice(i))
    if (digits) {
      tokens.push(Number(digits[0].replace(',', '.')))
      i += digits[0].length
      continue
    }
    const c = source[i]
    if ('x·*'.includes(c)) tokens.push('*')
    else if (':/'.includes(c)) tokens.push('/')
    else if ('-−'.includes(c)) tokens.push('-')
    else if ('+()'.includes(c)) tokens.push(c)
    else return null
    i++
  }
  return tokens
}

/** Verdien av et uttrykk, eller null når det ikke er et fullstendig uttrykk. */
export function evaluate(expression: string): number | null {
  const parsed = tokenize(expression)
  if (!parsed || parsed.length === 0) return null
  const tokens: Token[] = parsed
  let pos = 0
  const peek = () => tokens[pos]
  const primary = (): number | null => {
    const token = tokens[pos++]
    if (typeof token === 'number') return token
    if (token === '-') {
      const value = primary()
      return value === null ? null : -value
    }
    if (token === '(') {
      const value = sum()
      return tokens[pos++] === ')' ? value : null
    }
    return null
  }
  const product = (): number | null => {
    let value = primary()
    while (value !== null && (peek() === '*' || peek() === '/')) {
      const op = tokens[pos++]
      const right = primary()
      if (right === null) return null
      value = op === '*' ? value * right : value / right
    }
    return value
  }
  function sum(): number | null {
    let value = product()
    while (value !== null && (peek() === '+' || peek() === '-')) {
      const op = tokens[pos++]
      const right = product()
      if (right === null) return null
      value = op === '+' ? value + right : value - right
    }
    return value
  }
  const value = sum()
  return value !== null && pos === tokens.length && Number.isFinite(value) ? value : null
}

/**
 * Regnerekker med «=»: starter og slutter med et tall eller en parentes. Et minustegn rett foran
 * det første tallet hører med (−6 + 9 = 3). Mellomrom i tall (1 004) slås sammen ved utregningen.
 */
const ARITHMETIC_RUN = /(?:(?<![\w)])[-−])?[\d(](?:[\d\s()x·*:/+\-−=]|,(?=\d))*[\d)]/g
const OPERATOR = /[+\-−x·*:/]/
const UNIT_WORD = /^\s*(tiere|tier|hundrere|hundrer|enere|ener)\b/i
/** Rest etter en divisjon: «14 : 4 = 3 rest 2», «… = 3 med 2 til overs» eller «… = 3, og 2 til overs». */
const REMAINDER_AFTER = /^\s*(?:rest\s+(\d+)|,?\s*(?:og|med)\s+(\d+)\s+til overs)/i

/** Ordet foran en nummerert etikett («Steg 1:», «Trinn 2:»). */
const STEP_LABEL = /\b(steg|trinn|del)\s*$/i

/** Om teksten foran en regnerekke slutter med et regnetegn eller et tomt felt (ikke kolon etter et ord, som i «Fyll inn:»). */
function operatorBefore(text: string) {
  const trimmed = text.trimEnd()
  const last = trimmed.slice(-1)
  if (last === ':') return /[\d)]$/.test(trimmed.slice(0, -1).trimEnd())
  return last === '_' || (last !== '' && OPERATOR.test(last))
}

/**
 * Kontrollerer alle regnerekker med «=» i teksten: alle fullstendige sider skal ha samme verdi.
 * En side som fortsetter utenfor rekka (f.eks. «+ __» eller «3 hundrere») regnes ikke med.
 * Gir antall kontrollerte rekker og feilene.
 */
export function checkEquations(text: string): { checked: number; errors: string[] } {
  let checked = 0
  const errors: string[] = []
  for (const match of text.matchAll(ARITHMETIC_RUN)) {
    const run = match[0]
    if (!run.includes('=')) continue
    const before = operatorBefore(text.slice(0, match.index))
    const after = text.slice((match.index ?? 0) + run.length)
    // «Steg 1: 18 + 12 = 30»: tallet foran kolonet er en etikett, ikke et tall som deles.
    const label = STEP_LABEL.test(text.slice(0, match.index)) ? /^\d+\s*:\s*/.exec(run) : null
    const sides = (label ? run.slice(label[0].length) : run).split('=').map((s) => s.trim())
    if (before) sides.shift()
    const next = after.trimStart()[0] ?? ''
    if (OPERATOR.test(next) || next === '_' || UNIT_WORD.test(after)) sides.pop()
    const remainder = REMAINDER_AFTER.exec(after)
    if (remainder && sides.length === 2) {
      // Divisjon med rest: venstre side er «a : b», høyre side er antall hele grupper.
      const division = /^(\d+)\s*[:/]\s*(\d+)$/.exec(sides[0].replace(/(\d) (?=\d{3}\b)/g, '$1'))
      const quotient = evaluate(sides[1])
      if (!division || quotient === null) continue
      const [a, b, r] = [Number(division[1]), Number(division[2]), Number(remainder[1] ?? remainder[2])]
      checked++
      if (b === 0 || Math.floor(a / b) !== quotient || a % b !== r) errors.push(`«${run.trim()} rest ${r}» stemmer ikke`)
      continue
    }
    const values = sides.filter(Boolean).map(evaluate)
    if (values.length < 2 || values.some((v) => v === null)) continue
    checked++
    // Desimaltall: 0,6 + 0,7 er 1,3 (ikke 1,2999…).
    if (!values.every((v) => Math.abs(v! - values[0]!) < 1e-9)) errors.push(`«${run.trim()}» stemmer ikke`)
  }
  return { checked, errors }
}

/** Fasiten som en liste med hele tall («12, 30, 70», «4; 7» eller «5 999 og 6 001»), ellers null. */
function numberList(solution: string): number[] | null {
  const parts = solution.split(/,|;|\bog\b/).map((p) => p.trim().replace(/(\d) (?=\d{3}\b)/g, '$1'))
  return parts.length > 0 && parts.every((p) => /^\d+$/.test(p)) ? parts.map(Number) : null
}

/**
 * Kontrollerer det som kan kontrolleres maskinelt i én referanse:
 * - regnerekker i fasiten
 * - tomme felt («__») fylt med fasiten, når fasiten er én verdi per felt
 * - «Regn ut …: a x b, c x d …» og «Still opp og regn ut: a + b» mot en fasit med like mange tall
 * - regnerekker i oppgaveteksten – ikke i feilanalyser og feilvurderinger, der feilen er meningen
 */
export function checkReferenceMath(
  ref: Pick<ReferenceTask, 'studentText' | 'solution' | 'format'> & { teacherNote?: string | null; workedSolution?: string },
): { checked: number; errors: string[] } {
  const results = [checkEquations(ref.solution)]
  // Lærernotatet og løsningsforslaget viser ofte utregningen – den skal også stemme.
  if (ref.teacherNote) results.push(checkEquations(ref.teacherNote))
  if (ref.workedSolution) results.push(checkEquations(ref.workedSolution))
  const answers = numberList(ref.solution)
  const blanks = ref.studentText.match(/__+/g)?.length ?? 0

  if (blanks > 0 && answers && answers.length === blanks) {
    let i = 0
    results.push(checkEquations(ref.studentText.replace(/__+/g, () => String(answers[i++]))))
  } else if (!/feilanalyse|feilvurdering/i.test(ref.format)) {
    results.push(checkEquations(ref.studentText))
  }

  if (blanks === 0 && answers && /^(Still opp og )?regn ut/i.test(ref.studentText)) {
    // «Regn ut: 3 x 4, 5 x 6 …» eller «Still opp og regn ut: 2 314 + 1 562» (mellomrom i tall slås sammen).
    const text = ref.studentText.replace(/(\d) (?=\d{3}\b)/g, '$1')
    const products = [...text.matchAll(/(\d+)\s*([x·+\-−])\s*(\d+)/g)].map(([, a, op, b]) =>
      'x·'.includes(op) ? Number(a) * Number(b) : op === '+' ? Number(a) + Number(b) : Number(a) - Number(b),
    )
    if (products.length === answers.length) {
      const wrong = products.flatMap((p, i) => (p === answers[i] ? [] : [`svar ${i + 1} skal være ${p}, ikke ${answers[i]}`]))
      results.push({ checked: products.length, errors: wrong })
    }
  }
  return { checked: results.reduce((n, r) => n + r.checked, 0), errors: results.flatMap((r) => r.errors) }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

// ---------------------------------------------------------------------------------------------
// Flervalg: alternativene står i elevteksten som egne linjer («A) 14»). Brukes av valideringen av
// banken og av kontrollen av AI-oppgaver (problemSolvingChecks.ts).

export interface ChoiceOption {
  letter: string
  text: string
}

/** Alternativene i elevteksten: linjer som starter med «A)», «B)» … (også «A:» og «A.»), i rekkefølge. */
export function parseOptions(studentText: string): ChoiceOption[] {
  return [...studentText.matchAll(/^[ \t]*([A-F])[).:][ \t]+(.+?)[ \t]*$/gm)].map(([, letter, text]) => ({ letter, text }))
}

/** Elevteksten sier tydelig at flere alternativer kan være riktige. */
export const MANY_CORRECT = /mer enn (én|ett|ei|en)\b|flere (kan være |er )?(riktige|sanne)|flere riktige|ett eller flere|en eller flere|kan være flere/i

/** Bokstavene fasiten starter med: «B) 32», «B. 72 − 25 …», «A, B og D er sanne», «Riktig svar: C». */
export function correctLetters(solution: string): string[] {
  const m = /^\s*(?:riktig(?:e)? (?:svar|alternativ(?:er)?)\s*(?:er|:)\s*)?([A-F](?:\s*(?:,|og)\s*[A-F])*)(?=$|[\s).:,])/i.exec(solution)
  return m ? [...new Set(m[1].toUpperCase().match(/[A-F]/g) ?? [])] : []
}

/** Kontrollerer flervalgsmetadataene i én referanse mot elevteksten og fasiten. */
function optionErrors(ref: ReferenceTask): string[] {
  if (ref.options === undefined && ref.correctOptions === undefined) return []
  const errors: string[] = []
  const options = Array.isArray(ref.options) ? ref.options : []
  const correct = Array.isArray(ref.correctOptions) ? ref.correctOptions : []
  const shown = parseOptions(ref.studentText)
  if (options.length < 2) errors.push('flervalg uten minst to alternativer')
  if (shown.length !== options.length) errors.push(`elevteksten viser ${shown.length} alternativer, metadataene har ${options.length}`)
  shown.forEach((o, i) => {
    if (o.letter !== 'ABCDEF'[i]) errors.push(`alternativ ${o.letter} står ikke i rekkefølge`)
    if (options[i] !== undefined && o.text.trim() !== options[i].trim()) errors.push(`alternativ ${o.letter} er ulikt i elevteksten og metadataene`)
  })
  if (new Set(options.map((o) => o.trim().toLowerCase())).size !== options.length) errors.push('to alternativer er like')
  const letters = options.map((_, i) => 'ABCDEF'[i])
  if (correct.length === 0 || correct.some((l) => !letters.includes(l))) errors.push('korrektAlternativ peker ikke på et alternativ')
  if (correct.length > 1 && !MANY_CORRECT.test(ref.studentText)) errors.push('flere riktige alternativer uten at elevteksten sier det')
  const named = correctLetters(ref.solution)
  if (named.join() !== [...correct].sort().join()) errors.push(`fasiten peker på ${named.join(', ') || 'ingen'}, korrektAlternativ på ${correct.join(', ')}`)
  return errors
}

/**
 * Kontrollerer referansebanken: antall, unike ID-er, ID-mønster, fagområder og nivåer, påkrevde felt
 * og fasiter som kan regnes ut. `expectedCount` er antallet banken skal ha.
 */
export function validateReferenceBank(raw: unknown, expectedCount: number, spec: BankSpec = MULTIPLICATION_BANK): BankCheck {
  const idPattern = new RegExp(`^${spec.idPrefix}([1-${spec.areas.length}])-N([1-3])-(\\d{2})$`)
  const errors: string[] = []
  let checkedEquations = 0
  if (!isObject(raw) || !Array.isArray(raw.references)) return { errors: ['Referansebanken mangler lista «references».'], checkedEquations }
  const bank = raw as unknown as ReferenceBank
  const refs = bank.references

  if (refs.length !== expectedCount) errors.push(`Banken har ${refs.length} referanser, ikke ${expectedCount}.`)
  if (bank.referenceCount !== refs.length) errors.push(`referenceCount er ${bank.referenceCount}, men lista har ${refs.length}.`)

  const ids = new Set<string>()
  const texts = new Set<string>()
  const perArea = new Map<string, Map<number, number>>()
  const areaTitles = new Map<string, string>()

  refs.forEach((ref, i) => {
    const where = isObject(ref) && typeof ref.id === 'string' ? ref.id : `referanse nr. ${i + 1}`
    if (!isObject(ref)) return errors.push(`${where}: er ikke et objekt.`)
    for (const field of REQUIRED_TEXT) {
      if (typeof ref[field] !== 'string' || !(ref[field] as string).trim()) errors.push(`${where}: mangler «${field}».`)
    }
    if (ref.topic !== spec.topic) errors.push(`${where}: hovedtema er «${ref.topic}», ikke «${spec.topic}».`)
    if (![1, 2, 3].includes(ref.level)) errors.push(`${where}: ugyldig nivå ${ref.level}.`)
    if (!spec.areas.includes(ref.area)) errors.push(`${where}: ukjent fagområde «${ref.area}».`)
    if (ref.representationHint !== null && typeof ref.representationHint !== 'string') errors.push(`${where}: ugyldig representasjon.`)
    if (!isObject(ref.source) || typeof ref.source.kind !== 'string' || typeof ref.source.document !== 'string' || !ref.source.document) {
      errors.push(`${where}: mangler kilde.`)
    }

    if (ids.has(ref.id)) errors.push(`${where}: ID-en er brukt før.`)
    ids.add(ref.id)
    // Ingen identiske elevtekster (små/store bokstaver og mellomrom teller ikke).
    const studentText = typeof ref.studentText === 'string' ? ref.studentText.trim().toLowerCase().replace(/\s+/g, ' ') : ''
    if (studentText && texts.has(studentText)) errors.push(`${where}: elevteksten finnes allerede i en annen referanse.`)
    texts.add(studentText)

    const id = idPattern.exec(ref.id)
    if (!id) errors.push(`${where}: ID-en følger ikke mønsteret ${spec.idPrefix}1-N1-01.`)
    else {
      if (spec.areas[Number(id[1]) - 1] !== ref.area) errors.push(`${where}: ID-en passer ikke med fagområdet «${ref.area}».`)
      if (Number(id[2]) !== ref.level) errors.push(`${where}: ID-en passer ikke med nivå ${ref.level}.`)
    }

    const known = areaTitles.get(ref.area)
    if (known && known !== ref.areaTitle) errors.push(`${where}: annen tittel på fagområdet enn de andre referansene.`)
    areaTitles.set(ref.area, ref.areaTitle)

    const levels = perArea.get(ref.area) ?? new Map<number, number>()
    levels.set(ref.level, (levels.get(ref.level) ?? 0) + 1)
    perArea.set(ref.area, levels)

    if (typeof ref.studentText === 'string' && typeof ref.solution === 'string') {
      const math = checkReferenceMath(ref)
      checkedEquations += math.checked
      for (const error of math.errors) errors.push(`${where}: ${error}.`)
      for (const error of optionErrors(ref)) errors.push(`${where}: ${error}.`)
    }
    if (ref.answerForm !== undefined && !['kort', 'forklaring'].includes(ref.answerForm)) errors.push(`${where}: ugyldig svarform.`)
    if (ref.workedSolution !== undefined && (typeof ref.workedSolution !== 'string' || !ref.workedSolution.trim())) errors.push(`${where}: tomt løsningsforslag.`)
  })

  const perAreaCount = expectedCount / spec.areas.length
  for (const area of spec.areas) {
    const levels = perArea.get(area)
    const count = levels ? [...levels.values()].reduce((a, b) => a + b, 0) : 0
    if (count !== perAreaCount) errors.push(`Fagområdet ${area} har ${count} referanser, ikke ${perAreaCount}.`)
    for (const level of [1, 2, 3]) if (!levels?.get(level)) errors.push(`Fagområdet ${area} mangler nivå ${level}.`)
  }

  return { errors, checkedEquations }
}
