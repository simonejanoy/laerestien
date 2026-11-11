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
  if (expected.kind === 'item') return expected.value
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
  return undefined
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
