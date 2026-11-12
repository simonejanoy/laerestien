import { isMathDraft, type AiTaskDraft, type MeasurementArea } from '../src/ai/contract.ts'
import { NEGATIVE } from './divisionChecks.ts'
import { CLAIM, MISSING_FIGURE } from './geometryChecks.ts'
import {
  ANY_DECIMAL,
  COUNT,
  DOT_DECIMAL,
  HUNDREDTHS,
  NUMBER,
  SAME_AMOUNT,
  UNITS,
  compoundsIn,
  countOf,
  digitsIn,
  measuresIn,
  merge,
  missingCommonUnit,
  same,
  sentences,
  targetUnit,
  toNumber,
  unitInfo,
  type Measure,
  type MeasureKind,
} from './numbersAndOperationsChecks.ts'
import { numberLimit } from './problemSolvingChecks.ts'
import { measurementReferences } from './references/measurement.ts'
import { evaluate } from './references/validate.ts'

// Faglige kontroller for AI-oppgaver i Måling. Enhetene leses og regnes om med den felles enhetskontrollen fra
// Tall og regning (numbersAndOperationsChecks.ts), utvidet med liter, desiliter, kilogram, gram, kvadratenheter,
// ruter, terninger, timer og minutter. Tall, enheter, regnestykker, klokkeslett og mål på rektangler leses og
// regnes ut – ordsøk brukes bare til å finne hva oppgaven spør om. Kontrollene gjelder alltid – også når
// læreren har skrevet «Andre ønsker».

/** Hvorfor en oppgave i Måling ikke kan brukes. */
export type MeasurementProblem =
  | 'offTopic'
  | 'wrongArea'
  | 'wrongSolution'
  | 'wrongConclusion'
  | 'decimalFormat'
  | 'tooManyDecimals'
  | 'wrongConversion'
  | 'missingUnit'
  | 'foreignUnit'
  | 'wrongAreaUnit'
  | 'wrongTime'
  | 'unreasonableValue'
  | 'outsideRange'
  | 'levelMismatch'
  | 'missingFigure'
  | 'missingInfo'
  | 'revealedSolution'

export interface MeasurementContext {
  area: MeasurementArea
}

/** Alle størrelsene enhetskontrollen kjenner. */
const ALL_KINDS: readonly MeasureKind[] = ['lengde', 'volum', 'masse', 'areal', 'tid', 'ruter', 'rutesider', 'terninger']

/**
 * Enhetene (kort skrivemåte) som hører til hvert fagområde. Andre enheter – ml, cl, mg, tonn, mm, dm, km,
 * sekunder – avvises, også når «Andre ønsker» ber om dem (f.eks. «bruk matlaging»).
 */
export const AREA_UNITS: Record<MeasurementArea, readonly string[]> = {
  'volum-liter-desiliter': ['l', 'dl', 'terninger'],
  'desimaltall-maling': ['l', 'dl', 'kg', 'g'],
  'kilogram-gram': ['kg', 'g'],
  'areal-omkrets': ['cm', 'm', 'cm²', 'm²', 'ruter', 'rutesider'],
  tid: ['t', 'min', 'kvarter'],
}

/** Enhetsord som ikke er i tabellen, men som tydelig er måleenheter (avvises i alle fagområder). */
const OTHER_UNIT_WORDS = /(?<!\p{L})(km|kilometer|hektar|dekar|mil|kubikk\p{L}*|cm³|dm³|m³|km²)(?![\p{L}²³])/iu
/** Kvadratenhet skrevet uten ² («24 cm2», «cm^2»). */
const AREA_UNIT_TYPO = /(?<!\p{L})(mm|cm|dm|m)(\s?\^\s?2|2)(?![\d²])/iu
/** Innhold som ikke hører til Måling: penger, brøk, prosent og vinkler. */
const OFF_TOPIC = /\bbrøk|\bprosent|\bvinkel|\bkroner\b|\bkr\b|(?<!\p{L})øre(?!\p{L})|(?<![\d:])\d+\/\d+(?![\d:])/iu
/** Eleven vurderer en påstand eller finner en feil. */
const ASSESSMENT = new RegExp(`${CLAIM.source}|stemmer (det|dette)|finn feil|gjort feil|hva er galt|har \\p{L}+ gjort`, 'iu')
/** Henvisning til en klokke, figur eller modell som ikke vises (appen kan ikke tegne figurer til AI-oppgaver i Måling). */
const MISSING_CLOCK =
  /\bse (på )?(klokka|klokken|urskiva|uret|rutenettet|rutearket|tegningen)\b|\b(klokka|klokken|urskiva|uret|rutenettet|rektangelet|figuren|esken) (under|over|nedenfor|ovenfor|til høyre|til venstre|på bildet)\b|\bklokka viser(?!\s*(kl\.?\s*)?\d)/i
/** Oppgaver der eleven lager eller tegner egne eksempler – fasiten er bare et eksempel. */
const OPEN_TASK = /^\s*(lag|tegn|finn)\s+(to|tre|2|3)\s+ulike\b/i

const unitsIn = (text: string) => compoundsIn(text, ALL_KINDS)
const firstOf = (list: Measure[], kinds: readonly MeasureKind[]) => list.find((m) => kinds.includes(m.kind))

// ---------------------------------------------------------------------------------------------
// Klokkeslett: alltid 24-timers digital tid med kolon, f.eks. kl. 08:45.

const CLOCK = /(?<![\d:,])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g
const CLOCK_ANY = /(?<![\d:,])(\d{1,2}):(\d{2})(?![\d:])/g
const minutesOf = (h: string, m: string) => Number(h) * 60 + Number(m)
const clocksIn = (text: string) => [...text.matchAll(CLOCK)].map((m) => ({ minutes: minutesOf(m[1], m[2]), index: m.index!, end: m.index! + m[0].length }))
/** Klokkeslett med punktum («kl. 18.05»): ikke samme skrivemåte som resten av appen. */
const CLOCK_WITH_DOT = /\b(kl\.?|klokka|klokken)\s*\d{1,2}\.\d{2}\b|(?<![\d,])\d{1,2}\.\d{2}(?!\d)/i
/** Om tidspunktet er formiddag eller ettermiddag (analog klokke med visere er tvetydig uten det). */
const DAY_PART = /formiddag|ettermiddag|morgen|kveld|natt|midt på dagen|om dagen|frokost|middag|lunsj|skolestart/i

/** Varigheter (ikke klokkeslett) i teksten, i minutter. */
const durationsIn = (text: string) => compoundsIn(text.replace(CLOCK_ANY, ' '), ['tid'])

// ---------------------------------------------------------------------------------------------
// Regnestykker med enheter og klokkeslett: «15 dL − 6 dL = 9 dL = 0,9 L», «16:30 + 1 time = 17:30».

interface Term {
  value: number
  base: number
  unit: string
  kind: MeasureKind | 'klokke' | ''
  compound: boolean
}
type Token = { t: 'num'; term: Term } | { t: 'op'; op: string } | { t: 'eq' } | { t: 'break' }

const OPERATORS: Record<string, string> = { '+': '+', '-': '-', '−': '-', '·': '*', x: '*', '×': '*', '*': '*', ':': '/', '/': '/' }

function tokenize(text: string, clocks: boolean): Token[] {
  const flat = merge(text)
  const compounds = new Map(compoundsIn(flat, ALL_KINDS).map((m) => [m.index, m]))
  const clockAt = new Map(clocks ? clocksIn(flat).map((c) => [c.index, c]) : [])
  const tokens: Token[] = []
  const number = new RegExp(`^${NUMBER}`)
  for (let i = 0; i < flat.length; ) {
    const clock = clockAt.get(i)
    if (clock) {
      tokens.push({ t: 'num', term: { value: clock.minutes, base: clock.minutes, unit: 'klokke', kind: 'klokke', compound: false } })
      i = clock.end
      continue
    }
    const measure = compounds.get(i)
    if (measure) {
      const compound = measuresIn(flat.slice(measure.index, measure.end), ALL_KINDS).length > 1
      tokens.push({ t: 'num', term: { value: measure.value, base: measure.base, unit: measure.unit, kind: measure.kind, compound } })
      i = measure.end
      continue
    }
    const rest = flat.slice(i)
    const digits = number.exec(rest)
    if (digits && !/\d/.test(flat[i - 1] ?? '')) {
      const value = toNumber(digits[0])
      tokens.push({ t: 'num', term: { value, base: value, unit: '', kind: '', compound: false } })
      i += digits[0].length
      continue
    }
    const c = flat[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    const word = /^\p{L}+/u.exec(rest)
    if (word) {
      tokens.push(word[0] === 'x' ? { t: 'op', op: '*' } : { t: 'break' })
      i += word[0].length
      continue
    }
    if (c === '=') tokens.push({ t: 'eq' })
    // Kolon er deletegn bare med mellomrom foran og et tall før («2000 g : 4»), ikke etter en etikett («4 ruter: 2 · 4»).
    else if (OPERATORS[c] && (c !== ':' || (tokens.at(-1)?.t === 'num' && /\s/.test(flat[i - 1] ?? '')))) tokens.push({ t: 'op', op: OPERATORS[c] })
    else tokens.push({ t: 'break' })
    i++
  }
  return tokens
}

/**
 * Kontrollerer regnerekker med «=» der tallene kan ha enheter eller være klokkeslett. Har rekka ulike enheter av samme
 * størrelse (eller sammensatte målinger som «5 t 30 min»), regnes alt om til grunnenheten; ellers regnes tallene som de står.
 * Gir 'conversion' når en rekke med ulike enheter ikke stemmer, 'math' når en rekke med samme enhet ikke stemmer.
 */
export function unitEquationProblem(text: string, clocks = false): 'conversion' | 'math' | null {
  const tokens = tokenize(text, clocks)
  // Rekker: tall (op tall)* (= tall (op tall)*)+, uten brudd.
  let i = 0
  while (i < tokens.length) {
    if (tokens[i].t !== 'num') {
      i++
      continue
    }
    const sides: Token[][] = [[]]
    let j = i
    let expectNumber = true
    for (; j < tokens.length; j++) {
      const tok = tokens[j]
      if (expectNumber && tok.t === 'num') {
        sides.at(-1)!.push(tok)
        expectNumber = false
      } else if (!expectNumber && tok.t === 'op') {
        sides.at(-1)!.push(tok)
        expectNumber = true
      } else if (!expectNumber && tok.t === 'eq') {
        sides.push([])
        expectNumber = true
      } else break
    }
    // Et regnetegn eller «=» uten tall etter seg: siste del hører ikke med.
    if (expectNumber) sides.at(-1)!.pop()
    const complete = sides.filter((s) => s.length > 0 && s.at(-1)!.t === 'num')
    if (complete.length >= 2) {
      const terms = complete.flat().flatMap((t) => (t.t === 'num' ? [t.term] : []))
      const withUnit = terms.filter((t) => t.unit)
      const kindOf = (t: Term) => (t.kind === 'klokke' ? 'tid' : t.kind)
      const units = new Set(withUnit.map((t) => t.unit))
      const kinds = new Set(withUnit.map(kindOf))
      const convert = (units.size > 1 || withUnit.some((t) => t.compound)) && kinds.size === 1
      const number = (n: number) => String(Math.round(n * 1e6) / 1e6).replace('.', ',')
      const values = complete.map((side) => evaluate(side.map((t) => (t.t === 'num' ? number(convert ? t.term.base : t.term.value) : t.t === 'op' ? t.op : '')).join(' ')))
      if (values.every((v) => v !== null) && !values.every((v) => Math.abs(v! - values[0]!) < 1e-9)) return convert && units.size > 1 ? 'conversion' : 'math'
    }
    i = Math.max(j, i + 1)
  }
  return null
}

/**
 * «A er B», «A, som er B», «A er det samme som B» med sammensatte målinger («2 kg og 50 g er 2050 g»): de må være
 * like store. «=» i regnestykker («650 g + 450 g = 1100 g») kontrolleres av unitEquationProblem.
 */
function sameAmountError(text: string): boolean {
  const list = unitsIn(text)
  const flat = merge(text)
  return list.slice(1).some((m, i) => {
    const prev = list[i]
    const between = flat.slice(prev.end, m.index)
    const afterOperator = /[+\-−·x×*:/=]$/.test(flat.slice(0, prev.index).trimEnd())
    return prev.kind === m.kind && !between.includes('=') && !afterOperator && SAME_AMOUNT.test(between) && !same(prev.base, m.base)
  })
}

// ---------------------------------------------------------------------------------------------
// Hva oppgaven spør om.

/** Setningen med spørsmålet eller oppdraget (den første med «?», ellers den siste). */
const questionSentences = (studentText: string) => {
  const list = sentences(studentText)
  const asks = list.filter((s) => s.includes('?') || /^\s*(skriv|gjør om|finn|regn ut|svar)\b/i.test(s))
  return asks.length > 0 ? asks : list.slice(-1)
}

/** «1 kg er 1000 g.» og «0,1 kg er 100 g.»: setninger som bare forklarer enhetene. */
const UNIT_FACT = new RegExp(String.raw`^\s*${NUMBER}\s*\p{L}+²?\s*(er|=)\s*${NUMBER}\s*\p{L}+²?\.?\s*$`, 'iu')

/** Spørsmål som bare ber om en omgjøring: «Hvor mange dL er 3 L?», «Skriv 2,4 L i desiliter», «Gjør om …». */
const CONVERSION = /hvor mange \p{L}+²? er\b|\bskriv\b|gjør om|regn om/iu
const CONVERSION_OF_GIVEN = /hvor mange \p{L}+²? er (det|dette)\b|\bskriv\b[^.?!]*\bi\b|gjør om|regn om/iu

/** Målingen eleven skal gjøre om: målingen i spørsmålet, ellers den eneste målingen i teksten (enhetsfakta ikke medregnet). */
function amountAsked(studentText: string, kinds: readonly MeasureKind[]): Measure | null {
  const questions = questionSentences(studentText)
  const inQuestion = questions.flatMap((s) => compoundsIn(s, kinds))
  if (inQuestion.length > 1) return null
  if (inQuestion.length === 1) return CONVERSION.test(questions.join(' ')) ? inQuestion[0] : null
  // Målingen står i en setning før spørsmålet («En pose veier 1,5 kg. Hvor mange gram er det?»). Uten et rent
  // omgjøringsspørsmål må målingen være det eneste tallet i teksten («… trenger 4 L kraft. Hvor mange dL trengs?») –
  // ellers er det et regneproblem («4 like pakker veier 2 kg. Hvor mange gram veier én pakke?»).
  const body = sentences(studentText).filter((s) => !UNIT_FACT.test(s)).join(' ')
  const all = compoundsIn(body, kinds)
  if (all.length !== 1) return null
  const onlyNumber = digitsIn(body).length === digitsIn(merge(body).slice(all[0].index, all[0].end)).length
  return CONVERSION_OF_GIVEN.test(questions.join(' ')) || onlyNumber ? all[0] : null
}

/** Svaret er et tall uten enhet eller benevning helt først i fasiten («30.», «30»). */
const BARE_ANSWER = /^\s*(kl\.\s*)?\d+(,\d)?\s*(\.|$|,\s|;)/i
/** Spørsmålet ber om en størrelse (med enhet), ikke et antall ting. */
const ASKS_MEASURE = /hvor (mye|lang|tung|lenge)|hva er (arealet|omkretsen)|finn (arealet|omkretsen)|hvor mange (liter|desiliter|dl|l|kilo\p{L}*|kg|gram|g|minutter|timer|cm|m|meter|centimeter|kvadrat\p{L}*|cm²|m²)\b|\bnår\b/iu

/** Et tall med enhet, et klokkeslett eller et tall med benevning («5 glass», «4 bøtter»). */
const NAMED_NUMBER = /\d\s*(?!(og|er|eller|av|i|på|med|til|fra|ganger|som|=|\.)(\s|$))\p{L}{2,}/iu

// ---------------------------------------------------------------------------------------------
// Volum som antall terninger.

const CUBES = /\bterning|\bkube|\bklosser?\b/i
/** Et antall som eget ord («2», «to», «ett»), ikke slutten av et annet ord. */
const WORD_COUNT = String.raw`(?<![\p{L}\d])${COUNT}`
function cubeVolume(studentText: string): { volume: number | null; complete: boolean } {
  const rows = new RegExp(String.raw`${WORD_COUNT} rader`, 'iu').exec(studentText)
  const perRow = new RegExp(String.raw`rader med ${COUNT} (?:\p{L}+ )?(?:terninger|kuber|klosser)|${WORD_COUNT} (?:terninger|kuber|klosser) i (?:hver|hvert|en|én) rad`, 'iu').exec(studentText)
  const layers = new RegExp(String.raw`${WORD_COUNT} lag\b`, 'iu').exec(studentText)
  const oneLayer = /\b(bare|kun) (ett|et|ett eneste) lag\b|\bi (ett|hvert) lag\b|\bett lag\b/i.test(studentText)
  if (!rows || !perRow) return { volume: null, complete: false }
  const askOneLayer = questionSentences(studentText).some((s) => /\bi (ett|hvert|ett av) lag/i.test(s))
  const count = layers ? countOf(layers[1]) : oneLayer ? 1 : null
  if (count === null && !askOneLayer) return { volume: null, complete: false }
  const n = countOf(rows[1]) * countOf(perRow[1] ?? perRow[2]) * (askOneLayer ? 1 : count!)
  return { volume: Number.isFinite(n) ? n : null, complete: true }
}

// ---------------------------------------------------------------------------------------------
// Areal og omkrets av rektangler.

interface Rectangle {
  length: number
  width: number
  /** Enheten sidene er målt i: «cm», «m» eller «ruter». */
  unit: string
}

const SIDE_UNIT = String.raw`(cm|m|centimeter|meter|ruter)`
function rectanglesIn(studentText: string): Rectangle[] {
  const text = merge(studentText)
  const list: Rectangle[] = []
  const shortUnit = (u: string) => unitInfo(u)?.short ?? u.toLowerCase()
  for (const m of text.matchAll(new RegExp(String.raw`(\d+)\s*${SIDE_UNIT}\s+langt?e?\s+og\s+(\d+)\s*${SIDE_UNIT}\s+bredt?e?`, 'giu'))) {
    list.push({ length: Number(m[1]), width: Number(m[3]), unit: shortUnit(m[2]) })
  }
  for (const m of text.matchAll(new RegExp(String.raw`kvadrat\p{L}*[^.?!]*?sider?\w*\s+(?:som er\s+|på\s+)?(\d+)\s*${SIDE_UNIT}`, 'giu'))) {
    list.push({ length: Number(m[1]), width: Number(m[1]), unit: shortUnit(m[2]) })
  }
  for (const m of text.matchAll(new RegExp(String.raw`${WORD_COUNT} rader med ${COUNT} ruter`, 'giu'))) {
    list.push({ length: countOf(m[2]), width: countOf(m[1]), unit: 'ruter' })
  }
  return list
}

const AREA_UNIT_OF: Record<string, string> = { cm: 'cm²', m: 'm²', ruter: 'ruter' }
const PERIMETER_UNIT_OF: Record<string, string> = { cm: 'cm', m: 'm', ruter: 'rutesider' }
const isAreaUnit = (m: Measure) => m.kind === 'areal' || m.kind === 'ruter'
const isLengthUnit = (m: Measure) => m.kind === 'lengde' || m.kind === 'rutesider'

/** Hva målingen i fasiten er svar på: ordet «areal» eller «omkrets» foran den i samme setning. */
function labelOf(solution: string, measure: Measure): 'areal' | 'omkrets' | null {
  const before = merge(solution).slice(0, measure.index)
  const sentence = before.slice(Math.max(before.lastIndexOf('. '), before.lastIndexOf('\n')) + 1)
  const words = [...sentence.matchAll(/areal|omkrets/gi)]
  const last = words.at(-1)?.[0].toLowerCase()
  return last === 'areal' ? 'areal' : last === 'omkrets' ? 'omkrets' : null
}

const COMPOSITE = /består av (to|2|tre|3|flere)|sammensatt|satt sammen/i
const LAYOUT = /ligger (inntil|ved siden av)|deler (en|ei|én) (hel )?side|felles side|langs den/i

function areaPerimeterProblem(studentText: string, solution: string, assessment: boolean): MeasurementProblem | null {
  const question = questionSentences(studentText).join(' ')
  const asksArea = /areal|dekker|dekke|hvor mange ruter/i.test(question)
  const asksPerimeter = /omkrets|gjerde|rundt|kant/i.test(question)
  const shown = compoundsIn(solution, ['lengde', 'areal', 'ruter', 'rutesider'])
  const given = compoundsIn(studentText, ['lengde', 'areal', 'ruter', 'rutesider'])

  // Figuren vises ikke: målene må stå i teksten.
  const computes = /hva er|finn|regn ut|hvor (mye|lang|mange|stor)/i.test(question)
  if (computes && (asksArea || asksPerimeter) && /rektangel|kvadrat|figur|hage|rom\b|gulv/i.test(studentText) && given.length === 0 && !/\d/.test(studentText)) return 'missingInfo'
  const composite = COMPOSITE.test(studentText)
  if (composite && asksPerimeter && !LAYOUT.test(studentText)) return 'missingInfo'

  // Svaret er målingen med «areal» eller «omkrets» foran seg, eller den første målingen når oppgaven bare spør om
  // det ene. Mellomregninger («siden er 24 : 4 = 6 cm») er ikke svaret.
  const asked = asksArea && !asksPerimeter ? 'areal' : asksPerimeter && !asksArea ? 'omkrets' : null
  const labelFor = (m: Measure, i: number) => labelOf(solution, m) ?? (i === 0 ? asked : null)

  // Enheten må passe begrepet: areal i kvadratenheter eller ruter, omkrets i lengdeenheter eller rutesider.
  for (const [i, m] of shown.entries()) {
    const label = labelFor(m, i)
    if (label === 'areal' && isLengthUnit(m) && m.kind !== 'rutesider') return 'wrongAreaUnit'
    if (label === 'omkrets' && isAreaUnit(m) && !assessment) return 'wrongAreaUnit'
  }

  // Utregningen: areal = lengde · bredde, omkrets = summen av de fire sidene (sammensatt figur: summen av arealene).
  const rects = rectanglesIn(studentText)
  if (rects.length === 0 || new Set(rects.map((r) => r.unit)).size > 1) return null
  const unit = rects[0].unit
  const area = rects.reduce((sum, r) => sum + r.length * r.width, 0)
  const perimeter = rects.length === 1 ? 2 * (rects[0].length + rects[0].width) : null
  if (rects.length > 1 && !composite) return null
  for (const [i, m] of shown.entries()) {
    const label = labelFor(m, i)
    if (assessment && !label) continue
    if (label === 'areal' && m.unit === AREA_UNIT_OF[unit] && !same(m.value, area)) return 'wrongSolution'
    if (label === 'omkrets' && perimeter !== null && m.unit === PERIMETER_UNIT_OF[unit] && !same(m.value, perimeter)) return 'wrongSolution'
  }
  return null
}

/** Påstand om omkrets eller areal av et rektangel («… har omkretsen 21 cm»): sann eller usann, eller null. */
function rectangleClaim(studentText: string): boolean | null {
  const rects = rectanglesIn(studentText)
  if (rects.length !== 1) return null
  const [r] = rects
  const m = new RegExp(String.raw`(omkrets|areal)\p{L}*\s+(?:er\s+|på\s+)?(\d+)`, 'iu').exec(studentText)
  if (!m) return null
  const value = Number(m[2])
  return /omkrets/i.test(m[1]) ? value === 2 * (r.length + r.width) : value === r.length * r.width
}

// ---------------------------------------------------------------------------------------------
// Tid.

/** Start og slutt på et tidsintervall, med høyst noen få ord før klokkeslettet («begynner på leksene kl. 07:50»). */
const START = /(?:starter|begynner|går|åpner|drar|reiser|fra)\b[^.?!\d]{0,30}?(?:kl\.?\s*)?/
const END = /(?:slutter|er fremme|er ferdig|kommer fram|stenger|til)\b[^.?!\d]{0,30}?(?:kl\.?\s*)?/

function timeProblem(studentText: string, solution: string, assessment: boolean): MeasurementProblem | null {
  const all = `${studentText}\n${solution}`
  // Desimaltall i tid (1,5 time) og «1 time og 70 minutter»: tiden regnes som om en time hadde 100 minutter.
  if (/\d,\d\s*(timer?|t|minutter|minutt|min)(?!\p{L})/iu.test(all)) return 'wrongTime'
  for (const m of merge(all).matchAll(/(\d+)\s*(?:timer|time|t)\s+(?:og\s+)?(\d+)\s*(?:minutter|minutt|min)(?!\p{L})/giu)) if (Number(m[2]) >= 60) return 'wrongTime'
  // Analog klokke med visere: uten formiddag/ettermiddag er klokkeslettet tvetydig.
  if (/viser(en|ne)\b/i.test(studentText) && clocksIn(solution).length > 0 && !DAY_PART.test(studentText) && !/\beller\b/i.test(solution)) return 'wrongTime'
  if (assessment) return null

  const question = questionSentences(studentText).join(' ')
  // «Hva er klokka?» uten klokkeslett eller visere i teksten: klokka vises ikke i AI-oppgaver.
  if (/hva er klokka|hva viser klokka/i.test(question) && clocksIn(studentText).length === 0 && !/viser(en|ne)\b/i.test(studentText)) return 'missingFigure'
  const clocks = clocksIn(studentText)
  const given = durationsIn(studentText)
  const answerDuration = durationsIn(solution)[0]
  const answerClock = clocksIn(solution)[0]
  // Tidsintervall: «fra kl. 08:45 til kl. 09:20», «starter kl. 17:00 og slutter kl. 18:30».
  const interval = new RegExp(String.raw`${START.source}(\d{1,2}:\d{2})[^?!]*?${END.source}(\d{1,2}:\d{2})`, 'i').exec(studentText)
  if (interval && clocks.length === 2 && given.length === 0 && /hvor (lang|lenge)|hvor mange (minutter|timer)|hvor lang tid/i.test(question)) {
    const [from, to] = [interval[1], interval[2]].map((t) => minutesOf(...(t.split(':') as [string, string])))
    if (to > from) {
      if (!answerDuration) return 'missingUnit'
      if (!same(answerDuration.base, to - from)) return 'wrongTime'
    }
  }
  // Sluttid: «starter kl. 16:30 og varer i 1 time og 15 minutter. Når er treningen ferdig?»
  const lasts = /varer (i )?/i.test(studentText)
  if (lasts && clocks.length === 1 && given.length === 1 && /\bnår\b|hva er klokka/i.test(question) && /starter|begynner|går/i.test(studentText)) {
    if (!answerClock) return 'missingUnit'
    if (answerClock.minutes !== (clocks[0].minutes + given[0].base) % 1440) return 'wrongTime'
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Rimelig vekt.

/** Rimelig vekt i gram for én ting (romslige grenser): ubestemt form med «en/et/ei» og bestemt form. */
const OBJECT_MASS: [string, number, number][] = [
  ['eple|eplet', 50, 500],
  ['banan|bananen', 50, 400],
  ['appelsin|appelsinen', 80, 500],
  ['egg|egget', 30, 100],
  ['blyant|blyanten', 2, 50],
  ['viskelær|viskelæret', 5, 60],
  ['bok|boka|boken', 100, 3000],
  ['brød|brødet', 200, 2000],
  ['mobil|mobilen', 80, 400],
  ['sykkel|sykkelen', 3000, 30000],
  ['hund|hunden', 1000, 100000],
  ['katt|katten', 1000, 12000],
  ['skolesekk|skolesekken|sekk|sekken', 300, 15000],
]
const singleObject = (names: string) => new RegExp(String.raw`(?<!\p{L})(?:(?:en|et|ei|ett|én)\s+)?(?:${names})(?!\p{L})`, 'iu')

function unreasonableMass(text: string): boolean {
  // Linjer med valg («12 g eller 12 kg?») er spørsmål, ikke påstander.
  for (const clause of merge(text).split(/[.?!\n;]/)) {
    if (/\beller\b/i.test(clause)) continue
    const mass = measuresIn(clause, ['masse'])
    if (mass.length !== 1) continue
    // Flere ting («en pose epler», «to bøker») kan veie mye mer – bare én ting kontrolleres.
    if (/\b(pose|kasse|kurv|pakke|boks|bunke|stabel)\b|\b(to|tre|fire|fem|\d+)\s+\p{L}+er\b/iu.test(clause)) continue
    const known = OBJECT_MASS.filter(([names]) => singleObject(names).test(clause))
    if (known.length !== 1) continue
    const [, min, max] = known[0]
    if (mass[0].base < min || mass[0].base > max) return true
  }
  return false
}

// ---------------------------------------------------------------------------------------------
// Sammenligning, rekkefølge og påstander med enheter.

/** «Hvilken rommer mest: 15 dL eller 2 L?» – fasiten starter med den største (eller minste). */
function comparisonProblem(studentText: string, solution: string, kinds: readonly MeasureKind[]): boolean {
  const ask = /\b(mest|minst|tyngst|lettest|størst|lengst|kortest)\b/i.exec(questionSentences(studentText).join(' '))
  if (!ask || /rekkefølge|sorter|ordne/i.test(studentText)) return false
  const given = compoundsIn(studentText, kinds)
  if (given.length < 2 || new Set(given.map((m) => m.kind)).size > 1) return false
  const biggest = /mest|tyngst|størst|lengst/i.test(ask[1])
  const target = biggest ? Math.max(...given.map((m) => m.base)) : Math.min(...given.map((m) => m.base))
  const answer = compoundsIn(solution, kinds)[0]
  return !!answer && !same(answer.base, target)
}

/** «Sorter fra minst til størst»: målingene i den første setningen i fasiten står i riktig rekkefølge. */
function orderProblem(studentText: string, solution: string, kinds: readonly MeasureKind[]): boolean {
  const ask = /(?:rekkefølge|sorter\w*|ordne\w*)[^?]*?fra (minst|størst|lettest|tyngst|kortest|lengst) til/i.exec(studentText)
  if (!ask) return false
  const ascending = /minst|lettest|kortest/i.test(ask[1])
  const given = compoundsIn(studentText, kinds).map((m) => m.base)
  const answer = compoundsIn(sentences(solution)[0] ?? '', kinds).map((m) => m.base)
  if (given.length < 2 || answer.length !== given.length) return false
  const sorted = [...given].sort((a, b) => (ascending ? a - b : b - a))
  return !sorted.every((v, i) => same(v, answer[i]))
}

/**
 * Påstander eleven vurderer, regnet ut med enheter: «4 L er mindre enn 25 dL», «0,5 kg er det samme som 5 g»,
 * «2 kg og 50 g er 2500 g», «fra kl. 10:40 til kl. 11:30 … det er 90 minutter», «… har omkretsen 21 cm».
 * Gir om påstanden er sann, eller null når den ikke kan leses.
 */
function claimTruth(studentText: string): boolean | null {
  const flat = merge(studentText)
  const list = unitsIn(flat)
  for (let i = 1; i < list.length; i++) {
    const [a, b] = [list[i - 1], list[i]]
    if (a.kind !== b.kind) continue
    const between = flat.slice(a.end, b.index)
    if (/^\s*(er|veier|rommer)?\s*(mindre|lettere|kortere) enn\s*$/i.test(between)) return a.base < b.base
    if (/^\s*(er|veier|rommer)?\s*(mer|større|tyngre|lengre) enn\s*$/i.test(between)) return a.base > b.base
    if (/^\s*(er det samme som|er like mye som|er like tung som|=|er)\s*$/i.test(between)) return same(a.base, b.base)
  }
  const interval = new RegExp(String.raw`fra (?:kl\.?\s*)?(\d{1,2}:\d{2}) til (?:kl\.?\s*)?(\d{1,2}:\d{2})`, 'i').exec(studentText)
  const said = /(?:det er|det tar|det blir|tiden er)\s+(\d+)\s*(minutter|min)\b/i.exec(studentText)
  if (interval && said) {
    const [from, to] = [interval[1], interval[2]].map((t) => minutesOf(...(t.split(':') as [string, string])))
    return to - from === Number(said[1])
  }
  return rectangleClaim(studentText)
}

// ---------------------------------------------------------------------------------------------

/**
 * Kontrollerer én AI-oppgave i en måleøkt. Rekkefølge: skrivemåte (punktum, hundredeler, negative tall), innhold
 * utenfor Måling, enheter som ikke hører til økta, tallområdet, figurer og klokker som ikke vises, nivået,
 * enhet i svaret, regnestykker og omgjøringer med enheter, påstander, sammenligninger og til slutt kravene til
 * fagområdet (terninger, desimaltall i liter og kilogram, rimelig vekt, areal og omkrets, tid).
 */
export function measurementProblem(task: AiTaskDraft, { area }: MeasurementContext): MeasurementProblem | null {
  const math = isMathDraft(task)
  const studentText = math ? task.instruction : task.studentText
  const solution = math ? '' : task.solution
  const all = `${studentText}\n${solution}`
  const allowed = AREA_UNITS[area]
  const time = area === 'tid'

  // Klokkeslett med punktum eller som ikke finnes (13:75, 25:10).
  if (time && (CLOCK_WITH_DOT.test(all) || [...all.matchAll(CLOCK_ANY)].some((m) => Number(m[1]) > 23 || Number(m[2]) > 59))) return 'wrongTime'
  if (DOT_DECIMAL.test(all)) return 'decimalFormat'
  if (HUNDREDTHS.test(all)) return 'tooManyDecimals'
  if (NEGATIVE.test(all)) return 'offTopic'
  if (OFF_TOPIC.test(all)) return 'offTopic'
  if (AREA_UNIT_TYPO.test(all)) return 'wrongAreaUnit'

  // Enheter: bare enhetene i fagområdet, både med tall og som ord («gjør om til milliliter»).
  if (OTHER_UNIT_WORDS.test(all)) return 'foreignUnit'
  if (measuresIn(all, ALL_KINDS).some((m) => !allowed.includes(m.unit))) return 'foreignUnit'
  const unitWords = Object.keys(UNITS).filter((name) => name.length >= 2 && !['min', 'time', 'rute', 'ruter', 'kilo'].includes(name))
  for (const name of unitWords) {
    if (!allowed.includes(UNITS[name].short) && new RegExp(String.raw`(?<![\p{L}])${name}(?![\p{L}²])`, 'iu').test(all)) return 'foreignUnit'
  }

  // Desimaltall hører bare til «Desimaltall i måling» (tid med desimaltall kontrolleres i tidskontrollen).
  if (ANY_DECIMAL.test(all) && area !== 'desimaltall-maling' && !time) return 'wrongArea'

  const limit = numberLimit(area, task.level, measurementReferences)
  const numbers = math ? [task.a, task.b] : digitsIn(all)
  if (numbers.some((n) => n > limit)) return 'outsideRange'

  if (math) {
    // Regnestykket må ha en måleenhet fra økta i instruksjonen («Hvor mange gram er så mange kilo?»).
    const names = Object.keys(UNITS).filter((name) => allowed.includes(UNITS[name].short))
    if (!new RegExp(String.raw`(?<![\p{L}])(${names.join('|')})(?![\p{L}])`, 'iu').test(studentText)) return 'missingUnit'
    if (area === 'desimaltall-maling') return 'wrongArea'
    return null
  }

  if (MISSING_FIGURE.test(studentText) || MISSING_CLOCK.test(studentText)) return 'missingFigure'
  const assessment = ASSESSMENT.test(studentText)
  if (task.level === 1 && assessment) return 'levelMismatch'
  if (!assessment && /\bsvar(et)? (er|blir)\s*\d/i.test(studentText)) return 'revealedSolution'

  // Enhet i svaret: fasiten må ha minst én måling, ett klokkeslett eller et tall med benevning, og et svar
  // på en størrelse kan ikke starte med et tall uten enhet.
  const open = OPEN_TASK.test(studentText)
  if (!open && /\d/.test(solution) && unitsIn(solution).length === 0 && clocksIn(solution).length === 0 && !NAMED_NUMBER.test(solution)) return 'missingUnit'
  if (!open && !assessment && BARE_ANSWER.test(solution) && ASKS_MEASURE.test(questionSentences(studentText).join(' '))) return 'missingUnit'

  // Regnestykker og omgjøringer med enheter i fasiten (og i oppgaveteksten, når feilen ikke er meningen).
  const kinds = ALL_KINDS
  for (const text of assessment ? [solution] : [solution, studentText]) {
    const equation = unitEquationProblem(text, time)
    if (equation) return time ? 'wrongTime' : equation === 'conversion' ? 'wrongConversion' : 'wrongSolution'
    if (sameAmountError(text)) return time ? 'wrongTime' : 'wrongConversion'
  }

  // Omgjøring: «Hvor mange desiliter er 3 liter?», «Skriv 3 kg og 250 g i gram», «Skriv 90 minutter i timer og minutter».
  const target = targetUnit(studentText, kinds)
  const amount = !assessment && !open && target ? amountAsked(studentText, kinds) : null
  // En omgjøring bytter enhet i samme størrelse (ikke telleenheter som terninger og ruter).
  if (target && amount && unitInfo(target)?.kind === amount.kind && amount.unit !== target && ['lengde', 'volum', 'masse', 'areal', 'tid'].includes(amount.kind)) {
    const answer = compoundsIn(solution, [amount.kind])[0]
    if (!answer) return 'missingUnit'
    if (answer.unit !== target || !same(answer.base, amount.base)) return time ? 'wrongTime' : 'wrongConversion'
    const answerText = merge(solution).slice(answer.index, answer.end)
    if (merge(studentText).includes(answerText) && answerText !== merge(studentText).slice(amount.index, amount.end)) return 'revealedSolution'
  }

  // Påstander: konklusjonen (ja/nei) må stemme med utregningen.
  const conclusion = /^\s*(ja|nei)\b/i.exec(solution)?.[1].toLowerCase()
  if (assessment && conclusion) {
    const truth = claimTruth(studentText)
    if (truth !== null && (conclusion === 'ja') !== truth) return 'wrongConclusion'
  }
  // «Veier posene til sammen mer enn 1 kg?»: ja/nei må stemme med summen i fasiten.
  const moreThan = /(?:mer|mindre) enn\s+(\d+(?:,\d)?)\s*(\p{L}+)\s*\?/iu.exec(studentText)
  if (!assessment && conclusion && moreThan && unitInfo(moreThan[2])) {
    const limitBase = toNumber(moreThan[1]) * unitInfo(moreThan[2]).base
    // Summen er målingen rett etter «=» i fasiten («650 g + 450 g = 1100 g»).
    const flat = merge(solution)
    const sum = unitsIn(solution).find((m) => m.kind === unitInfo(moreThan[2]).kind && flat.slice(0, m.index).trimEnd().endsWith('='))?.base
    if (sum !== undefined) {
      const more = /mer enn/i.test(moreThan[0])
      if ((conclusion === 'ja') !== (more ? sum > limitBase : sum < limitBase)) return 'wrongConclusion'
    }
  }
  if (!assessment && (comparisonProblem(studentText, solution, kinds) || orderProblem(studentText, solution, kinds))) return 'wrongSolution'
  const ordering = /rekkefølge|sorter|ordne/i.test(studentText)
  if (!assessment && !ordering && /\b(mest|minst|tyngst|lettest|størst|sammenlign)/i.test(studentText) && missingCommonUnit(studentText, solution, ['volum', 'masse'])) return 'wrongConversion'

  // Fagområdet.
  if (area === 'volum-liter-desiliter' && CUBES.test(studentText) && !open) {
    const { volume, complete } = cubeVolume(studentText)
    if (!complete) return 'missingInfo'
    const answer = firstOf(unitsIn(solution), ['terninger'])
    if (!answer) return 'missingUnit'
    if (volume !== null && !same(answer.value, volume)) return 'wrongSolution'
  }
  if (area === 'desimaltall-maling') {
    if (!ANY_DECIMAL.test(all) && !/desimaltall|tidel/i.test(all)) return 'wrongArea'
    // Én desimal i liter og kilogram; desimaltall i dL eller g er hundredeler av en liter eller tusendeler av et kilo.
    if (measuresIn(all, ALL_KINDS).some((m) => !Number.isInteger(m.value) && !['l', 'kg'].includes(m.unit))) return 'tooManyDecimals'
  }
  if (area === 'kilogram-gram' || area === 'desimaltall-maling') {
    if (unreasonableMass(solution) || (!assessment && unreasonableMass(studentText))) return 'unreasonableValue'
  }
  if (area === 'areal-omkrets') {
    const problem = areaPerimeterProblem(studentText, solution, assessment)
    if (problem) return problem
  }
  if (time) {
    const problem = timeProblem(studentText, solution, assessment)
    if (problem) return problem
  }
  return null
}
