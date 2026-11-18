// Visning av oppgaver i Mønster og algoritmer: figurtall som prikker og tallrekker med inputbokser.
// Rene funksjoner uten React, så de brukes både i appen og på serveren (og kan testes i Node). Filen skal
// ikke importere noe (serveren kjører TypeScript direkte).
//
// AI-en og oppgavereglene tegner aldri selv. De skriver antallene i en fast tekstlinje
// («Figur 1: 5 prikker. Figur 2: 8 prikker. Figur 3: 11 prikker.»), og appen tegner prikkene ut fra tallene.

/** Figurtall tegnet som prikker: antallet i figur 1, 2, 3 … (figuren det spørres etter er ikke med). */
export interface DotsFigure {
  kind: 'dots'
  counts: number[]
}

/** Høyst så mange figurer og prikker per figur tegnes (ellers blir figuren uleselig). */
export const MAX_DOT_FIGURES = 5
export const MAX_DOTS = 64

const FIGURE = /\bfigur\s+(\d+)\s*(?::|har|er)\s*(?:(\d+)\s+rader?\s+med\s+(\d+)|[^.?!\n]*?=\s*(\d+)|(\d+))\s*prikk(?:er|en)?\b/giu
/** Den som påstår noe («Lise sier at figur 6 har 13 prikker») – påstander tegnes ikke. */
const CLAIM_BEFORE = /(?:sier|mener|tror|påstår|tenker)\s+at\s*$/i

/**
 * Antallet prikker i figurene teksten oppgir, i rekkefølge fra figur 1 – eller null når teksten ikke oppgir
 * figur 1, 2, 3 … uten hull (eller oppgir samme figur med ulike antall). Påstander tas ikke med.
 */
export function dotCountsIn(text: string): number[] | null {
  const byFigure = new Map<number, number>()
  for (const m of text.matchAll(FIGURE)) {
    if (CLAIM_BEFORE.test(text.slice(Math.max(0, m.index! - 30), m.index))) continue
    const k = Number(m[1])
    const value = m[2] ? Number(m[2]) * Number(m[3]) : Number(m[4] ?? m[5])
    if (byFigure.has(k) && byFigure.get(k) !== value) return null
    byFigure.set(k, value)
  }
  const ks = [...byFigure.keys()].sort((a, b) => a - b)
  if (ks.length === 0 || ks.some((k, i) => k !== i + 1)) return null
  return ks.map((k) => byFigure.get(k)!)
}

export type DotRule = 'pluss' | 'kvadrattall' | 'trekanttall'

/** Regelen prikkene tegnes etter: kvadrattall, trekanttall eller lik økning (minst 1). Null når ingen passer. */
export function dotRuleOf(counts: number[]): DotRule | null {
  if (counts.length === 0 || counts.some((c) => !Number.isInteger(c) || c < 1)) return null
  if (counts.every((c, i) => c === (i + 1) ** 2)) return 'kvadrattall'
  if (counts.every((c, i) => c === ((i + 1) * (i + 2)) / 2)) return 'trekanttall'
  if (counts.length === 1) return 'pluss'
  const d = counts[1] - counts[0]
  return d >= 1 && d <= 10 && counts.every((c, i) => c === counts[0] + i * d) ? 'pluss' : null
}

/** Én prikk: kolonne, rad og om den er ny i denne figuren (kom til siden forrige figur). */
export interface Dot {
  col: number
  row: number
  isNew: boolean
}

/**
 * Plasseringen av prikkene i hver figur, så veksten er lett å se:
 * - lik økning (5, 8, 11): figur 1 er en blokk i kolonner med like mange prikker som økningen; hver ny figur får
 *   én ny kolonne til høyre med de nye prikkene
 * - kvadrattall (1, 4, 9): k · k prikker; de nye danner en vinkel langs høyre kant og bunnen
 * - trekanttall (1, 3, 6): rader med 1, 2, 3 … prikker; de nye er en ny, lengre rad nederst
 * Null når antallene ikke følger en av reglene, eller figuren blir for stor til å tegnes.
 */
export function dotLayout(counts: number[]): Dot[][] | null {
  const rule = dotRuleOf(counts)
  if (!rule || counts.length > MAX_DOT_FIGURES || counts.some((c) => c > MAX_DOTS)) return null
  return counts.map((_, i) => {
    const k = i + 1
    const dots: Dot[] = []
    if (rule === 'kvadrattall') {
      for (let row = 0; row < k; row++) for (let col = 0; col < k; col++) dots.push({ col, row, isNew: k > 1 && (row === k - 1 || col === k - 1) })
    } else if (rule === 'trekanttall') {
      for (let row = 0; row < k; row++) for (let col = 0; col <= row; col++) dots.push({ col, row, isNew: k > 1 && row === k - 1 })
    } else {
      // Høyden er økningen (de nye prikkene i hver figur er én hel kolonne). Med én figur: en rad.
      const step = counts.length > 1 ? counts[1] - counts[0] : counts[0]
      const height = Math.max(1, step)
      const base = counts[0]
      for (let j = 0; j < base; j++) dots.push({ col: Math.floor(j / height), row: j % height, isNew: false })
      const baseCols = Math.ceil(base / height)
      for (let c = 0; c < k - 1; c++) for (let row = 0; row < height; row++) dots.push({ col: baseCols + c, row, isNew: c === k - 2 })
    }
    return dots
  })
}

// ---------------------------------------------------------------------------------------------
// Tallrekker med tomme felt («21, ___, ___, 24, …»): hvert tomme felt blir en inputboks i rekka.

export type RowItem = { kind: 'number'; value: string } | { kind: 'blank'; index: number } | { kind: 'more' }

export interface BlankRow {
  /** Teksten før og etter rekka (vises som vanlig tekst). */
  before: string
  after: string
  items: RowItem[]
  blanks: number
}

const ITEM = String.raw`(?:\d+|_{2,})`
const ROW = new RegExp(String.raw`${ITEM}(?:[ \t]*,[ \t]*${ITEM})+(?:[ \t]*,?[ \t]*(?:…|\.\.\.))?`, 'g')

/** Den lengste tallrekka med minst ett tomt felt i teksten, delt opp i tall og bokser – eller null. */
export function blankRowIn(text: string): BlankRow | null {
  let best: RegExpMatchArray | null = null
  for (const m of text.matchAll(ROW)) {
    if (/_{2,}/.test(m[0]) && (!best || m[0].length > best[0].length)) best = m
  }
  if (!best) return null
  const more = /(…|\.\.\.)\s*$/.test(best[0])
  let blanks = 0
  const items: RowItem[] = best[0]
    .replace(/,?\s*(…|\.\.\.)\s*$/, '')
    .split(',')
    .map((s) => s.trim())
    .map((s) => (/^_+$/.test(s) ? { kind: 'blank' as const, index: blanks++ } : { kind: 'number' as const, value: s }))
  if (more) items.push({ kind: 'more' })
  return { before: text.slice(0, best.index).replace(/[ \t]+$/, ''), after: text.slice(best.index! + best[0].length).replace(/^[ \t]+/, ''), items, blanks }
}

/** Elevens svar i boksene lagres som én tekst, som andre tekstsvar: «22, 23, 24». */
export const joinBoxAnswers = (values: string[]) => (values.every((v) => !v.trim()) ? '' : values.map((v) => v.trim()).join(', '))

/** Svarene i boksene fra den lagrede teksten (like mange som boksene, tomme der eleven ikke har skrevet). */
export function splitBoxAnswers(answer: string, blanks: number): string[] {
  const parts = answer === '' ? [] : answer.split(',').map((s) => s.trim())
  return Array.from({ length: blanks }, (_, i) => parts[i] ?? '')
}

/** Om alle boksene er fylt ut. */
export const boxesComplete = (answer: string, blanks: number) => blanks > 0 && splitBoxAnswers(answer, blanks).every((v) => v !== '')

// ---------------------------------------------------------------------------------------------
// Fargemønstre: fargerekka står på én egen linje («gul, grønn, gul, grønn»), og appen tegner en fylt sirkel med
// fargenavnet under for hvert ledd. AI-en og oppgavereglene tegner ikke selv.

/**
 * Fargene appen kan tegne. Fargetonene er Okabe–Ito-paletten, som er laget for å være lette å skille også for
 * fargeblinde; navnet står i tillegg under hver sirkel.
 */
export const PATTERN_COLORS: Record<string, string> = {
  rød: '#D55E00',
  blå: '#0072B2',
  gul: '#F0E442',
  grønn: '#009E73',
  oransje: '#E69F00',
  lilla: '#CC79A7',
  svart: '#000000',
}

/** Fargeord som kan stå i en fargerekke – også de appen ikke tegner (de avvises i kontrollen). */
const COLOR_WORDS = new Set([...Object.keys(PATTERN_COLORS), 'hvit', 'rosa', 'brun', 'grå', 'turkis', 'beige', 'fiolett', 'lyseblå', 'mørkeblå', 'gull', 'sølv'])

/** Fargemønster tegnet som sirkler: fargene i rekka slik den står i teksten. */
export interface ColorsFigure {
  kind: 'colors'
  items: string[]
}

/** Høyst så mange sirkler tegnes. */
export const MAX_COLOR_ITEMS = 12

/**
 * Fargerekkene i teksten: linjer som bare består av minst tre ord adskilt med komma, der minst to er fargeord.
 * Ordene kommer med små bokstaver – også ukjente farger, så kontrollen kan avvise dem.
 */
export function colorRowsIn(text: string): string[][] {
  return text
    .split('\n')
    .map((line) => line.trim().replace(/\.$/, ''))
    .filter((line) => /^\p{L}+(?:\s*,\s*\p{L}+){2,}$/u.test(line))
    .map((line) => line.split(',').map((w) => w.trim().toLowerCase()))
    .filter((items) => items.filter((w) => COLOR_WORDS.has(w)).length >= 2)
}

/** Om alle fargene kan tegnes, og rekka ikke er for lang. */
export const drawableColors = (items: string[]) => items.length >= 2 && items.length <= MAX_COLOR_ITEMS && items.every((w) => w in PATTERN_COLORS)

/** Fargerekka skal ikke vises dobbelt for eleven: teksten uten linja som tegnes som sirkler (lærerkortet viser hele teksten). */
export function withoutColorRow(text: string, items: string[]): string {
  const lines = text.split('\n')
  const at = lines.findIndex((line) => {
    const rows = colorRowsIn(line)
    return rows.length === 1 && rows[0].join(',') === items.join(',')
  })
  return at < 0 ? text : lines.filter((_, i) => i !== at).join('\n')
}

/** Svaralternativene til et spørsmål om fargen på en plass: fargene i rekka, i den rekkefølgen de først står. */
export const colorOptions = (items: string[]) => [...new Set(items)]

// ---------------------------------------------------------------------------------------------
// Automatisk retting (Mønster og algoritmer): det korte svaret oppgaven har, satt av oppgavereglene eller av serveren
// når kontrollen selv har regnet ut svaret. Fasiten (løsningsforslaget) er fri tekst og leses ikke for å rette.

export type ExpectedAnswer =
  /** Ett tall, med eller uten enhet («14» og «14 prikker»). */
  | { kind: 'number'; value: number }
  /** Flere tall i rekkefølge (tallrekke i bokser, de neste leddene, tallet etter hver runde). */
  | { kind: 'numbers'; values: number[] }
  /** Én figur (●, ■, ▲) eller farge. */
  | { kind: 'item'; value: string }
  /** Flere figurer eller farger i rekkefølge (de neste leddene i et mønster). */
  | { kind: 'items'; values: string[] }
  /** Regning: regnetegnet som mangler («10 __ 5 = 50» → ·). */
  | { kind: 'operator'; value: '+' | '−' | '·' | ':' }
  /**
   * Regning: flere spørsmål i samme oppgave («Hvilken regneart passer? Hvor mange boller blir det?», «Hvor mange stemmer
   * fikk håndball? Hva fikk flest stemmer?»). Hvert spørsmål får sitt eget svarfelt og rettes for seg.
   */
  | { kind: 'parts'; parts: QuestionPart[] }
  /**
   * Ett eller flere regnestykker eleven skriver selv («Lag to regnestykker: ett med pluss og ett med gange»). Eleven får
   * ferdige rader med regnetegn og =, og skriver bare tallene: «[ ] + [ ] = [ ]». Rekkefølgen på leddene og faktorene
   * betyr ikke noe for + og · (2 · 4 = 8 og 4 · 2 = 8), og radene med samme regnetegn kan komme i hvilken som helst
   * rekkefølge. Se equationsStatus.
   */
  | { kind: 'equations'; equations: EquationAnswer[] }

/** Regnetegnene appen bruker i svar: pluss, typografisk minus, gangeprikk og kolon for deling. */
export type EquationSign = '+' | '−' | '·' | ':'

/** Ett regnestykke i svaret: leddene eller faktorene (minst to) og resultatet. Det er alltid regnet riktig. */
export interface EquationAnswer {
  sign: EquationSign
  operands: number[]
  result: number
}

/** Antall tallbokser eleven fyller ut: ett per ledd og ett for resultatet, i hver rad. */
export const equationBoxCount = (equations: EquationAnswer[]) => equations.reduce((n, e) => n + e.operands.length + 1, 0)

/** «4 + 4 = 8» */
export const formatEquation = (e: EquationAnswer) => `${e.operands.join(` ${e.sign} `)} = ${e.result}`

/** Elevens tall i boksene (lagret som «4, 4, 8, 2, 4, 8»), delt i én rad per regnestykke. */
export function equationRows(answer: string, equations: EquationAnswer[]): string[][] {
  const values = splitBoxAnswers(answer, equationBoxCount(equations))
  let at = 0
  return equations.map((e) => {
    const row = values.slice(at, at + e.operands.length + 1)
    at += e.operands.length + 1
    return row
  })
}

const sameNumbers = (a: number[], b: number[], ordered: boolean) => {
  if (a.length !== b.length) return false
  if (ordered) return a.every((x, i) => x === b[i])
  const sorted = (xs: number[]) => [...xs].sort((x, y) => x - y)
  return sameList(sorted(a), sorted(b))
}

/**
 * Om regnestykkene eleven skrev er riktige. En rad er riktig når resultatet og leddene stemmer med et av de riktige
 * regnestykkene med samme regnetegn – i hvilken som helst rekkefølge for + og ·, i fast rekkefølge for − og :. Hvert
 * riktige regnestykke kan bare brukes én gang, og ber oppgaven om to ulike stykker (3 · 4 og 4 · 3), må eleven skrive to
 * ulike stykker.
 */
export function equationsStatus(equations: EquationAnswer[], answer: string): 'correct' | 'wrong' {
  const rows = equationRows(answer, equations)
  if (rows.some((row) => row.some((v) => !/^\d+$/.test(v)))) return 'wrong'
  const written = rows.map((row) => row.map(Number))
  const used = new Set<number>()
  const fits = (i: number): boolean => {
    if (i === written.length) return true
    const sign = equations[i].sign
    const operands = written[i].slice(0, -1)
    const result = written[i].at(-1)
    for (let j = 0; j < equations.length; j++) {
      const e = equations[j]
      if (used.has(j) || e.sign !== sign || e.result !== result) continue
      if (!sameNumbers(operands, e.operands, sign === '−' || sign === ':')) continue
      used.add(j)
      if (fits(i + 1)) return true
      used.delete(j)
    }
    return false
  }
  if (!fits(0)) return 'wrong'
  // To ulike stykker i oppgaven (f.eks. 3 · 4 og 4 · 3) må være to ulike stykker hos eleven også.
  const key = (xs: number[]) => xs.join(',')
  const distinctExpected = new Set(equations.map((e) => `${e.sign}${key([...e.operands, e.result])}`)).size
  const distinctWritten = new Set(written.map((row, i) => `${equations[i].sign}${key(row)}`)).size
  return distinctWritten >= distinctExpected ? 'correct' : 'wrong'
}

/** Svaret på ett spørsmål: et tall (tallboks), et regnetegn (fire knapper) eller et navn fra diagrammet eller tabellen (knapper). */
export type PartAnswer = { kind: 'number'; value: number } | { kind: 'operator'; value: '+' | '−' | '·' | ':' } | { kind: 'choice'; value: string }

/** Ett spørsmål i oppgaven (nøyaktig slik det står i teksten) og svaret på det. */
export interface QuestionPart {
  question: string
  answer: PartAnswer
}

/** Om svaret på ett spørsmål er riktig: tallet, regnetegnet (også x, *, / og -) eller navnet (små og store bokstaver likt). */
export function partCorrect(answer: PartAnswer, value: string): boolean {
  const v = value.trim()
  if (answer.kind === 'number') return /^\d+$/.test(v) && Number(v) === answer.value
  if (answer.kind === 'operator') return normalizeOperator(v) === answer.value
  return v.toLowerCase() === answer.value.toLowerCase()
}

/** Svaret på ett spørsmål slik eleven ser det. */
export const formatPart = (answer: PartAnswer) => String(answer.value)

/** Svarene på delene lagres som én tekst, én del per linje. */
export const joinParts = (values: string[]) => values.map((v) => v.replace(/\n/g, ' ').trim()).join('\n')

/** Regnetegnet slik appen skriver det: «x», «*» og «×» er ·, «/» er :, og «-» er −. */
export const normalizeOperator = (sign: string) => ({ '+': '+', '-': '−', '−': '−', '·': '·', x: '·', X: '·', '×': '·', '*': '·', ':': ':', '/': ':' })[sign.trim()] ?? null

/** Figurer skrevet med ord: eleven har ikke ●, ■ og ▲ på tastaturet. */
const ITEM_WORDS: Record<string, string> = {
  sirkel: '●', sirkelen: '●', sirkler: '●', runding: '●', rundingen: '●', rund: '●', prikk: '●', ball: '●',
  kvadrat: '■', kvadratet: '■', firkant: '■', firkanten: '■', firkantet: '■',
  trekant: '▲', trekanten: '▲', trekantet: '▲',
}
const ITEMS = ['●', '■', '▲', ...Object.keys(PATTERN_COLORS)]

/** Figurene og fargene i svaret, i rekkefølge (figurnavn blir tegn). */
function itemsIn(answer: string): string[] {
  return (answer.toLowerCase().match(/[●■▲]|\p{L}+/gu) ?? []).map((w) => ITEM_WORDS[w] ?? w).filter((w) => ITEMS.includes(w))
}

/** Tallene i svaret. Desimaltall med komma eller punktum er ett tall («2,5» og «2.5»); en liste med komma og mellomrom er flere. */
function numbersIn(answer: string): number[] {
  return (answer.match(/\d+(?:[.,]\d+(?!\s*,\s*\d))?/g) ?? []).map((n) => Number(n.replace(',', '.')))
}

const sameList = <T>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** Tall som står i et regnestykke i svaret («4 + 9 · 3 = 31») er en forklaring, ikke et eget svar. */
const CALCULATION = /\d+(?:[.,]\d+)?(?:\s*[+\-−·x×*:/=]\s*\d+(?:[.,]\d+)?)+/g

/** Tallene i svaret som kan være svar: ikke tall fra oppgaven, og ikke tall i et regnestykke (bortsett fra resultatet). */
function answerNumbers(answer: string, given: Set<number>, expected?: number): number[] {
  const results: number[] = []
  const rest = answer.replace(CALCULATION, (calc) => {
    const last = numbersIn(calc.slice(calc.lastIndexOf('=') + 1))
    if (calc.includes('=') && last.length) results.push(last[0])
    return ' '
  })
  return [...numbersIn(rest), ...results].filter((n) => !given.has(n) || (expected !== undefined && Math.abs(n - expected) < 1e-9))
}

/**
 * Vurderingen av elevens svar: «correct», «wrong», eller «several» når svaret har flere ulike tall, figurer eller farger
 * («14 eller 15») og det bare finnes ett riktig svar – da bes eleven skrive ett svar.
 * Tall som står i oppgaven («figur 10») og tall i et regnestykke i forklaringen teller ikke. Tåler store og små
 * bokstaver, mellomrom, tegnsetting, enhet eller benevning («14 prikker»), desimalkomma og -punktum, figurnavn
 * («trekant» for ▲) og tallrekker skrevet med komma, mellomrom eller «og».
 */
export function answerStatus(expected: ExpectedAnswer, answer: string, taskText = ''): 'correct' | 'wrong' | 'several' {
  if (expected.kind === 'equations') return equationsStatus(expected.equations, answer)
  if (expected.kind === 'operator') return normalizeOperator(answer) === expected.value ? 'correct' : 'wrong'
  if (expected.kind === 'parts') {
    const values = answer.split('\n')
    return expected.parts.every((p, i) => partCorrect(p.answer, values[i] ?? '')) ? 'correct' : 'wrong'
  }
  const given = new Set(numbersIn(taskText))
  if (expected.kind === 'number') {
    const candidates = [...new Set(answerNumbers(answer, given, expected.value))]
    if (candidates.length > 1) return 'several'
    return candidates.length === 1 && Math.abs(candidates[0] - expected.value) < 1e-9 ? 'correct' : 'wrong'
  }
  if (expected.kind === 'numbers') {
    const found = (answer.replace(CALCULATION, ' ').match(/\d+/g) ?? []).map(Number)
    // Eleven kan skrive av tallene som står i rekka først («9, 16, 23, 30, 37, 44»), og sluttallet en gang til.
    for (let skip = 0; skip <= found.length; skip++) {
      if (skip > 0 && !given.has(found[skip - 1])) break
      const rest = found.slice(skip)
      if (sameList(rest, expected.values) || sameList(rest, [...expected.values, expected.values.at(-1)!])) return 'correct'
    }
    return 'wrong'
  }
  const found = itemsIn(answer)
  if (expected.kind === 'item') {
    if (new Set(found).size > 1) return 'several'
    return found[0] === expected.value ? 'correct' : 'wrong'
  }
  return sameList(found, expected.values) ? 'correct' : 'wrong'
}

/** Om elevens svar er riktig (se answerStatus). */
export const isCorrect = (expected: ExpectedAnswer, answer: string, taskText = '') => answerStatus(expected, answer, taskText) === 'correct'

/** Det riktige svaret slik eleven ser det. */
export function formatExpected(expected: ExpectedAnswer): string {
  if (expected.kind === 'number') return String(expected.value)
  if (expected.kind === 'numbers') return expected.values.join(', ')
  if (expected.kind === 'item' || expected.kind === 'operator') return expected.value
  if (expected.kind === 'parts') return expected.parts.map((p) => formatPart(p.answer)).join('; ')
  if (expected.kind === 'equations') return expected.equations.map(formatEquation).join(' og ')
  return expected.values.join(expected.values.every((v) => v in PATTERN_COLORS) ? ', ' : ' ')
}

/** Leser et lagret eller mottatt svar. Bare kjente former; ellers undefined (oppgaven rettes da ikke automatisk). */
export function readExpected(value: unknown): ExpectedAnswer | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as Record<string, unknown>
  const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0
  const isItem = (x: unknown): x is string => typeof x === 'string' && ITEMS.includes(x)
  if (v.kind === 'number' && isNumber(v.value)) return { kind: 'number', value: v.value }
  if (v.kind === 'numbers' && Array.isArray(v.values) && v.values.length > 0 && v.values.every(isNumber)) return { kind: 'numbers', values: v.values }
  if (v.kind === 'item' && isItem(v.value)) return { kind: 'item', value: v.value }
  if (v.kind === 'items' && Array.isArray(v.values) && v.values.length > 0 && v.values.every(isItem)) return { kind: 'items', values: v.values }
  if (v.kind === 'operator' && typeof v.value === 'string' && ['+', '−', '·', ':'].includes(v.value)) return { kind: 'operator', value: v.value as '+' | '−' | '·' | ':' }
  if (v.kind === 'equations' && Array.isArray(v.equations) && v.equations.length > 0 && v.equations.length <= MAX_EQUATIONS) {
    const equations = (v.equations as unknown[]).map(readEquation)
    if (equations.every((e): e is EquationAnswer => e !== null)) return { kind: 'equations', equations }
  }
  if (v.kind === 'parts' && Array.isArray(v.parts) && v.parts.length > 0) {
    const parts = (v.parts as unknown[]).map(readPart)
    if (parts.every((p): p is QuestionPart => p !== null)) return { kind: 'parts', parts }
  }
  return undefined
}

/** Høyst så mange regnestykker i ett svar, og høyst så mange ledd i hvert. */
export const MAX_EQUATIONS = 4
export const MAX_EQUATION_OPERANDS = 6

/** Et regnestykke som er regnet riktig, ellers null (se evaluate). */
function readEquation(value: unknown): EquationAnswer | null {
  if (typeof value !== 'object' || value === null) return null
  const { sign, operands, result } = value as Record<string, unknown>
  if (typeof sign !== 'string' || !['+', '−', '·', ':'].includes(sign)) return null
  if (!Array.isArray(operands) || operands.length < 2 || operands.length > MAX_EQUATION_OPERANDS) return null
  if (!operands.every((n) => Number.isInteger(n) && n >= 0) || !Number.isInteger(result)) return null
  const equation = { sign: sign as EquationSign, operands: operands as number[], result: result as number }
  return evaluate(equation.sign, equation.operands) === equation.result ? equation : null
}

/** Verdien av regnestykket, eller null når det ikke går (minus og deling har to tall, og delingen må gå opp). */
export function evaluate(sign: EquationSign, operands: number[]): number | null {
  if (sign === '+') return operands.reduce((a, b) => a + b, 0)
  if (sign === '·') return operands.reduce((a, b) => a * b, 1)
  if (operands.length !== 2) return null
  const [a, b] = operands
  if (sign === '−') return a - b >= 0 ? a - b : null
  return b !== 0 && a % b === 0 ? a / b : null
}

// ---------------------------------------------------------------------------------------------
// Figurmønstre (●, ■, ▲): svaralternativene er figurene i rekka, med navn.

/** Navnet på figurene, slik de står på svarknappene. */
export const SYMBOL_NAMES: Record<string, string> = { '●': 'sirkel', '■': 'kvadrat', '▲': 'trekant' }

/** Figurene i den første figurrekka i teksten («▲ ▲ ● ▲ ▲ ●»), eller null. */
export function symbolRowIn(text: string): string[] | null {
  const m = /[●■▲](?:[ \t,]+[●■▲]){2,}/.exec(text)
  return m ? (m[0].match(/[●■▲]/g) ?? []) : null
}

/** Svaralternativene til et spørsmål om figuren eller fargen på en plass: leddene i rekka, i den rekkefølgen de først står. */
export const itemOptions = (items: string[]) => [...new Set(items)]

// ---------------------------------------------------------------------------------------------
// Figurtall: setningene med antallene («Figur 1: 2 prikker.») vises ikke for eleven når prikkene tegnes.

const FIGURE_SENTENCE = /^figur\s+\d+\s*(?::|har\b|er\b)[^?!]*?prikk\p{L}*\.?$/iu

/** Teksten uten setningene som oppgir antall prikker i figurene som tegnes. Resten av teksten står. */
export function withoutDotSentences(text: string): string {
  // Linjer som blir tomme fordi setningene tas ut, fjernes; tomme linjer som fantes fra før, står.
  return text
    .split('\n')
    .flatMap((line) => {
      const kept = line
        .split(/(?<=\.)\s+/)
        .filter((sentence) => !FIGURE_SENTENCE.test(sentence.trim()))
        .join(' ')
      return kept.trim() || !line.trim() ? [kept] : []
    })
    .join('\n')
}

/** Leser ett spørsmål med svar, eller null. */
function readPart(value: unknown): QuestionPart | null {
  if (typeof value !== 'object' || value === null) return null
  const { question, answer } = value as { question?: unknown; answer?: { kind?: unknown; value?: unknown } }
  if (typeof question !== 'string' || !question.trim() || typeof answer !== 'object' || answer === null) return null
  if (answer.kind === 'number' && typeof answer.value === 'number' && Number.isInteger(answer.value) && answer.value >= 0) return { question, answer: { kind: 'number', value: answer.value } }
  if (answer.kind === 'operator' && typeof answer.value === 'string' && ['+', '−', '·', ':'].includes(answer.value)) {
    return { question, answer: { kind: 'operator', value: answer.value as '+' | '−' | '·' | ':' } }
  }
  if (answer.kind === 'choice' && typeof answer.value === 'string' && answer.value.trim()) return { question, answer: { kind: 'choice', value: answer.value } }
  return null
}
