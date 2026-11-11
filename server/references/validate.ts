import { MULTIPLICATION_AREAS, PLACE_VALUE_AREAS } from '../../src/ai/contract.ts'
import type { ReferenceBank, ReferenceTask } from './types.ts'

// Kontroll av referansebankene. Kjøres når serveren starter (multiplication.ts, placeValue.ts) og i testene.

/** Hva en bank skal inneholde: tema, ID-prefiks (M1-N1-01, T1-N1-01) og fagområdene i rekkefølge. */
export interface BankSpec {
  topic: string
  idPrefix: string
  areas: readonly string[]
}

export const MULTIPLICATION_BANK: BankSpec = { topic: 'multiplikasjon', idPrefix: 'M', areas: MULTIPLICATION_AREAS }
export const PLACE_VALUE_BANK: BankSpec = { topic: 'tall-og-plassverdi', idPrefix: 'T', areas: PLACE_VALUE_AREAS }
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
    const digits = /^\d+/.exec(source.slice(i))
    if (digits) {
      tokens.push(Number(digits[0]))
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
const ARITHMETIC_RUN = /(?:(?<![\w)])[-−])?[\d(][\d\s()x·*:/+\-−=]*[\d)]/g
const OPERATOR = /[+\-−x·*:/]/
const UNIT_WORD = /^\s*(tiere|tier|hundrere|hundrer|enere|ener)\b/i

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
    const sides = run.split('=').map((s) => s.trim())
    if (before) sides.shift()
    const next = after.trimStart()[0] ?? ''
    if (OPERATOR.test(next) || next === '_' || UNIT_WORD.test(after)) sides.pop()
    const values = sides.filter(Boolean).map(evaluate)
    if (values.length < 2 || values.some((v) => v === null)) continue
    checked++
    if (!values.every((v) => v === values[0])) errors.push(`«${run.trim()}» stemmer ikke`)
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
 * - regnerekker i oppgaveteksten – ikke i feilanalyser, der feilen er meningen
 */
export function checkReferenceMath(
  ref: Pick<ReferenceTask, 'studentText' | 'solution' | 'format'> & { teacherNote?: string | null },
): { checked: number; errors: string[] } {
  const results = [checkEquations(ref.solution)]
  // Lærernotatet viser ofte utregningen – den skal også stemme.
  if (ref.teacherNote) results.push(checkEquations(ref.teacherNote))
  const answers = numberList(ref.solution)
  const blanks = ref.studentText.match(/__+/g)?.length ?? 0

  if (blanks > 0 && answers && answers.length === blanks) {
    let i = 0
    results.push(checkEquations(ref.studentText.replace(/__+/g, () => String(answers[i++]))))
  } else if (!/feilanalyse/i.test(ref.format)) {
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
    }
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
