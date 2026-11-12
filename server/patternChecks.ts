import { isMathDraft, type AiTaskDraft, type AiTextDraft, type PatternArea } from '../src/ai/contract.ts'
import { MAX_COLOR_ITEMS, MAX_DOT_FIGURES, MAX_DOTS, PATTERN_COLORS, blankRowIn, colorRowsIn, dotCountsIn, dotLayout, drawableColors, type ExpectedAnswer } from '../src/ai/patternDisplay.ts'
import { MISSING_FIGURE } from './geometryChecks.ts'
import { numberLimit } from './problemSolvingChecks.ts'
import { patternReferences } from './references/patterns.ts'

// Faglige kontroller for AI-oppgaver i Mønster og algoritmer. Mønstre, figurtall, tallfølger og pseudokode kan
// regnes ut, så kontrollene regner: perioden i et gjentakende mønster, regelen i et figurtall eller en tallfølge
// (bare enkle regler: +d, −d, · r, voksende hopp, kvadrattall, trekanttall og summen av de to forrige), og en liten
// kjører for pseudokoden i kodeformatet. Ingen full tolk for et programmeringsspråk. Ordsøk brukes bare til å finne
// hva oppgaven spør om. Kontrollene gjelder alltid – også når læreren har skrevet «Andre ønsker».

/** Hvorfor en oppgave i Mønster og algoritmer ikke kan brukes. */
export type PatternProblem =
  | 'format'
  | 'offTopic'
  | 'wrongArea'
  | 'wrongSolution'
  | 'wrongConclusion'
  | 'wrongPattern'
  | 'ambiguousRule'
  | 'invalidCode'
  | 'invalidVisual'
  | 'missingInfo'
  | 'missingFigure'
  | 'outsideRange'
  | 'levelMismatch'
  | 'revealedSolution'
  | 'unclearSolution'

export interface PatternContext {
  area: PatternArea
  /** Tilgrensende områder i økta (økt 1: figurtall ved siden av utforske mønster). */
  secondaryAreas?: readonly PatternArea[]
  /** Største tall i oppgavesettet på nivået. Tallområdet er det største av dette og referansene på nivået. */
  existingMax?: number
  /**
   * Fylles med det korte svaret når kontrollen selv har regnet det ut og funnet det i fasiten (tall, tallrekke, figur
   * eller farge). Appen retter da elevens svar automatisk. Oppgaver der eleven lager, vurderer eller retter noe, får ikke svar.
   */
  found?: { expected?: ExpectedAnswer }
}

/** Det korte svaret kontrollen fant (se PatternContext.found). */
type Found = { expected?: ExpectedAnswer }

// ---------------------------------------------------------------------------------------------
// Felles tekstverktøy

const NUMBER_WORDS: Record<string, number> = { én: 1, en: 1, ett: 1, ei: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9, ti: 10 }
const numberWord = (word: string) => (/^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word.toLowerCase()])
/** Gangetabellene med ord: «tregangen» → 3. */
const TABLE_WORDS: Record<string, number> = { to: 2, tre: 3, fire: 4, fem: 5, seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9, ti: 10 }

const numbersOf = (text: string) => (text.match(/\d+/g) ?? []).map(Number)
const sentencesOf = (text: string) => text.split(/(?<=[.?!:])\s+|\n/).map((s) => s.trim()).filter(Boolean)
/** Setningene som spør eller gir et oppdrag («Hvilken figur …?», «Skriv de to neste tallene: …»). */
const IMPERATIVE = /^(skriv|tegn|finn|lag|fyll|sorter|rett|forklar|regn|fortsett|bruk)\b/i
const questionsOf = (text: string) => sentencesOf(text).filter((s) => s.includes('?') || IMPERATIVE.test(s))
const firstSentence = (text: string) => sentencesOf(text)[0] ?? ''

/** Om `needle` står som en sammenhengende del av `list`. */
function containsRun<T>(list: T[], needle: T[]) {
  if (needle.length === 0) return true
  for (let i = 0; i + needle.length <= list.length; i++) if (needle.every((x, j) => list[i + j] === x)) return true
  return false
}

const sameSet = (a: number[], b: number[]) => {
  const [x, y] = [[...new Set(a)].sort((p, q) => p - q), [...new Set(b)].sort((p, q) => p - q)]
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/** Konklusjonen i fasiten («Ja.», «Nei, …»), eller null. */
const conclusionOf = (solution: string) => /^\s*(ja|nei)\b/i.exec(solution)?.[1].toLowerCase() ?? null

/** Eleven vurderer en påstand eller finner en feil. */
const ASSESSMENT = /har \p{L}+ rett|hvem har rett|stemmer (det|dette|påstanden)|sier:|sier at|mener at|påstår|hevder|finn feil|hva er feil|hva er galt|gjort feil|rett (opp )?programmet|byttet plass|byttet om|er feil\b/iu
/** Oppgaver der eleven lager noe selv – fasiten er bare et eksempel. */
const OPEN_TASK = /^\s*lag\b/i

// ---------------------------------------------------------------------------------------------
// Gjentakende mønstre: figurene ●, ■ og ▲, eller fargeord.

export const PATTERN_SYMBOLS = ['●', '■', '▲'] as const
const COLORS = ['rød', 'blå', 'gul', 'grønn', 'svart', 'hvit', 'lilla', 'oransje', 'rosa', 'brun']
const COLOR = `(?:${COLORS.join('|')})`
/** Andre figurtegn og emojier – appen skriver mønstre bare med ●, ■ og ▲ eller fargeord. */
const OTHER_SHAPES = /[○◯◦□▢▫▪△▽▼▶◀◆◇◼◻◾◽★☆♦♥♠♣⬛⬜⬤⭐]|[\u{1F534}-\u{1F53D}\u{1F7E0}-\u{1F7EB}]/u
const SYMBOL_RUN = /[●■▲](?:[ \t,]+[●■▲])+/g
const COLOR_RUN = new RegExp(`(?<!\\p{L})${COLOR}(?:[ \\t]*,[ \\t]*(?:og[ \\t]+)?${COLOR}|[ \\t]+og[ \\t]+${COLOR}|[ \\t]+${COLOR})+(?!\\p{L})`, 'giu')
const TOKEN = new RegExp(`[●■▲]|(?<!\\p{L})${COLOR}(?!\\p{L})`, 'giu')
/** Figurnavn i en fasit skrevet med ord. */
const SHAPE_WORDS: Record<string, string> = { sirkel: '●', sirkelen: '●', rundingen: '●', runding: '●', kvadrat: '■', kvadratet: '■', firkant: '■', firkanten: '■', trekant: '▲', trekanten: '▲' }

const tokensOf = (run: string) => (run.match(TOKEN) ?? []).map((t) => t.toLowerCase())

/** Mønstrene som står i teksten (minst tre ledd), i rekkefølge. Linjer med «Mønster A:» blir egne mønstre. */
export function patternsIn(text: string): string[][] {
  const found: { index: number; tokens: string[] }[] = []
  for (const m of text.matchAll(SYMBOL_RUN)) found.push({ index: m.index!, tokens: tokensOf(m[0]) })
  for (const m of text.matchAll(COLOR_RUN)) {
    const tokens = tokensOf(m[0])
    if (tokens.length >= 3) found.push({ index: m.index!, tokens })
  }
  return found.filter((f) => f.tokens.length >= 3).sort((a, b) => a.index - b.index).map((f) => f.tokens)
}

/** Den korteste gjentakelsen som passer alle leddene, og som vises minst to ganger – ellers null. */
export function periodOf(tokens: string[]): number | null {
  for (let p = 1; p * 2 <= tokens.length; p++) if (tokens.every((t, i) => t === tokens[i % p])) return p
  return null
}

/** Leddet på plass `position` (1, 2, 3 …) når mønsteret fortsetter likt. */
export const itemAt = (tokens: string[], period: number, position: number) => tokens[(position - 1) % period]

/** Det første figurtegnet eller fargeordet i teksten (også figurnavn som «trekant»), eller null. */
function firstToken(text: string): string | null {
  const m = new RegExp(`[●■▲]|(?<!\\p{L})(${COLOR}|${Object.keys(SHAPE_WORDS).join('|')})(?!\\p{L})`, 'iu').exec(text)
  if (!m) return null
  const t = m[0].toLowerCase()
  return SHAPE_WORDS[t] ?? t
}

/** Mulige rettinger av ett brudd: to naboer som har byttet plass, eller ett ledd som er feil. Gir plassene (1, 2 …). */
function fixesOf(tokens: string[], swapOnly: boolean): number[][] {
  const fixes = new Map<string, { positions: number[]; period: number }>()
  const add = (list: string[], positions: number[]) => {
    const period = periodOf(list)
    if (period !== null && period >= 2) fixes.set(positions.join(','), { positions, period })
  }
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (tokens[i] === tokens[i + 1]) continue
    const swapped = [...tokens]
    ;[swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]]
    add(swapped, [i + 1, i + 2])
  }
  if (!swapOnly) {
    const kinds = [...new Set(tokens)]
    tokens.forEach((t, i) => {
      for (const other of kinds) if (other !== t) add(tokens.map((x, j) => (j === i ? other : x)), [i + 1])
    })
  }
  // Den korteste gjentakelsen er mønsteret (en retting som bare gir en lang gjentakelse, f.eks. hele første halvdel, teller ikke).
  const shortest = Math.min(...[...fixes.values()].map((f) => f.period))
  return [...fixes.values()].filter((f) => f.period === shortest).map((f) => f.positions)
}

/** «Alle figurer på en plass i tregangen er ■.»: sann eller usann for mønsteret, eller null når påstanden ikke kan leses. */
function positionClaim(text: string, tokens: string[], period: number): boolean | null {
  const table = new RegExp(`alle (?:figurer|figurene|fargene|farger|ledd)?\\s*(?:som står )?på (?:en )?plass(?:ene)? i (\\p{L}+)gangen (?:er|blir) ([●■▲]|${COLOR})`, 'iu').exec(text)
  const parity = new RegExp(`alle (oddetall|partall)splass(?:er|ene) (?:har|er|blir) ([●■▲]|${COLOR})`, 'iu').exec(text)
  let step: number | null = null
  let offset = 0
  let item = ''
  if (table) {
    step = TABLE_WORDS[table[1].toLowerCase()] ?? null
    item = table[2].toLowerCase()
  } else if (parity) {
    step = 2
    offset = parity[1].toLowerCase() === 'oddetall' ? -1 : 0
    item = parity[2].toLowerCase()
  }
  if (!step) return null
  for (let k = 1; k <= period * step; k++) {
    const position = k * step + offset
    if (position >= 1 && itemAt(tokens, period, position) !== item) return false
  }
  return true
}

function repeatingProblem(studentText: string, solution: string, level: number, found: Found = {}): PatternProblem | null {
  const shown = patternsIn(studentText)
  const questions = questionsOf(studentText).join(' ')

  // Eleven lager et mønster selv: eksempelet i fasiten må gjenta seg og følge kravene i oppgaven.
  if (OPEN_TASK.test(studentText) && shown.length === 0) {
    const example = patternsIn(solution)[0]
    if (!example) return 'unclearSolution'
    const p = periodOf(example)
    if (!p || p < 2) return 'wrongPattern'
    const group = /gruppe på (\p{L}+|\d+) (?:figurer|farger)/iu.exec(studentText)
    if (group && numberWord(group[1]) !== p) return 'wrongSolution'
    const distinct = /(\p{L}+|\d+) ulike (?:figurer|farger)/iu.exec(studentText)
    if (distinct && numberWord(distinct[1]) !== new Set(example).size) return 'wrongSolution'
    const times = /minst (\p{L}+|\d+) ganger/iu.exec(studentText)
    if (times && example.length < (numberWord(times[1]) ?? 0) * p) return 'wrongSolution'
    return null
  }
  if (shown.length === 0) return /se på mønsteret|mønsteret (under|over)/i.test(studentText) ? 'missingFigure' : 'missingInfo'

  // Fargemønstre: fargerekka står på én egen linje med farger appen kan tegne (sirkler med navnet under).
  const colorRows = colorRowsIn(studentText)
  if (colorRows.some((row) => row.some((c) => !(c in PATTERN_COLORS)))) return 'invalidVisual'
  if (colorRows.some((row) => row.length > MAX_COLOR_ITEMS)) return 'outsideRange'
  if (shown.some((t) => !PATTERN_SYMBOLS.includes(t[0] as never)) && colorRows.length === 0) return 'format'

  // Et mønster med en feil: nøyaktig én retting, og fasiten peker på plassene.
  const tokens = shown[0]
  const errorTask = /byttet plass|byttet om|finn feil|feilen|er feil|brytes|passer ikke/i.test(studentText)
  if (errorTask && periodOf(tokens) === null) {
    if (level === 1) return 'levelMismatch'
    const fixes = fixesOf(tokens, /byttet plass|bytte(t)? om/i.test(studentText))
    if (fixes.length === 0) return 'wrongPattern'
    if (fixes.length > 1) return 'ambiguousRule'
    const named = numbersOf(firstSentence(solution))
    return sameSet(named, fixes[0]) ? null : 'wrongSolution'
  }

  // Mønstrene som vises, må gjenta seg likt i alle leddene.
  const periods = shown.map(periodOf)
  if (periods.some((p) => p === null || p < 2)) return 'wrongPattern'
  const period = periods[0]!

  // To mønstre: plassene der begge har samme figur.
  const range = /fra (\d+) til (\d+)/.exec(questions)
  if (shown.length >= 2 && /\bbegge\b/i.test(questions) && range) {
    const item = firstToken(questions.replace(/^[^?]*?(har|er)\b/i, ''))
    if (item) {
      const expected: number[] = []
      for (let k = Number(range[1]); k <= Number(range[2]); k++) if (shown.slice(0, 2).every((t, i) => itemAt(t, periods[i]!, k) === item)) expected.push(k)
      return sameSet(numbersOf(firstSentence(solution)), expected) ? null : 'wrongSolution'
    }
  }

  // Påstand om plassene: konklusjonen må stemme.
  const claim = positionClaim(studentText, tokens, period)
  const conclusion = conclusionOf(solution)
  if (claim !== null && conclusion && (conclusion === 'ja') !== claim) return 'wrongConclusion'

  // Figuren på en gitt plass. Plassen det spørres etter skal ikke være blant fargesirklene appen tegner.
  const positions = [...questions.matchAll(/\b(?:nummer|nr\.?|plass(?: nummer)?)\s+(\d+)\b/gi)].map((m) => Number(m[1]))
  if (colorRows.length === 1 && positions.some((position) => position <= colorRows[0].length)) return 'revealedSolution'
  for (const position of positions) {
    const expected = itemAt(tokens, period, position)
    const near = new RegExp(`(?:plass|nummer|nr\\.?)\\s*${position}(?!\\d)[^.?!●■▲]{0,15}?([●■▲]|${COLOR})`, 'iu').exec(solution)
    const answer = near ? near[1].toLowerCase() : positions.length === 1 ? firstToken(solution) : null
    if (answer === null) return positions.length === 1 ? 'unclearSolution' : null
    if (answer !== expected) return 'wrongSolution'
    if (positions.length === 1) found.expected = { kind: 'item', value: expected }
  }

  // Hvor mange av hver figur når mønsteret har en oppgitt lengde.
  const length = /(?:til det er|fortsetter til|i alt|til sammen|de første)\D{0,12}?(\d+)\s*(?:figurer|farger|perler|klosser|ledd)|(\d+)\s*(?:figurer|farger|perler|klosser|ledd)\s*(?:til sammen|i alt)/i.exec(studentText)
  if (length && /hvor mange/i.test(questions)) {
    const total = Number(length[1] ?? length[2])
    const asked = [...new Set(tokensOf(questions.slice(questions.search(/hvor mange/i))))]
    for (const item of asked) {
      let count = 0
      for (let k = 1; k <= total; k++) if (itemAt(tokens, period, k) === item) count++
      const paired = new RegExp(`(\\d+)\\s*${item}`, 'iu').exec(solution)
      if (paired ? Number(paired[1]) !== count : !numbersOf(solution).includes(count)) return 'wrongSolution'
      if (asked.length === 1) found.expected = { kind: 'number', value: count }
    }
  }

  // De neste leddene.
  const next = /(?:de |den )?(\p{L}+|\d+)?\s*neste (?:figur|figurene|figurer|farge|fargene|farger|ledd|leddene)/iu.exec(questions)
  if (next) {
    const count = next[1] ? (numberWord(next[1]) ?? 1) : 1
    const expected = Array.from({ length: count }, (_, j) => itemAt(tokens, period, tokens.length + j + 1))
    if (!containsRun(tokensOf(solution), expected)) return 'wrongSolution'
    // Spør oppgaven også om hva som gjentas, er svaret mer enn de neste leddene – da rettes den ikke automatisk.
    if (!/gjentas/i.test(questions)) found.expected = count === 1 ? { kind: 'item', value: expected[0] } : { kind: 'items', values: expected }
  }

  // Hva som gjentas: gjentakelsen (eller en rotasjon av den) må stå i fasiten.
  if (/(?:hva|hvilke|hvilken)\b[^?]*\bgjentas|hvilken del gjentas/i.test(questions)) {
    const unit = tokens.slice(0, period)
    const rotations = unit.map((_, r) => [...unit.slice(r), ...unit.slice(0, r)])
    if (!rotations.some((rot) => containsRun(tokensOf(solution), rot))) return 'wrongSolution'
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Figurtall: «Figur 1 har 2 prikker. Figur 2 har 4 prikker. …»

interface FigureValue {
  k: number
  v: number
  /** Navnet til den som påstår verdien («Lise sier at figur 6 har 13»), ellers tomt. */
  claimedBy: string
}

interface FigureRule {
  name: 'pluss' | 'kvadrattall' | 'trekanttall'
  at: (k: number) => number
}

const FIGURE = /\bfigur\s+(?:nummer\s+|nr\.?\s*)?(\d+)/giu
const CLAIM_BEFORE = /(\p{Lu}\p{Ll}+)\s+(?:sier|mener|tror|påstår|tenker|regner ut)\s+at\s*$/u
const stem = (word: string) => word.toLowerCase().slice(0, 4)

/** Verdiene til figurene i teksten. `noun` (f.eks. «fyrstikker») velger tallet når en figur har flere tall. */
function figureValues(text: string, noun?: string): { values: FigureValue[]; asked: number[] } {
  const matches = [...text.matchAll(FIGURE)]
  const values: FigureValue[] = []
  const asked: number[] = []
  matches.forEach((m, i) => {
    const k = Number(m[1])
    const end = matches[i + 1]?.index ?? text.length
    const rest = text.slice(m.index! + m[0].length, end)
    const cut = rest.slice(0, rest.search(/[.?!](\s|$)/) >= 0 ? rest.search(/[.?!](\s|$)/) : rest.length)
    const claim = CLAIM_BEFORE.exec(text.slice(Math.max(0, m.index! - 40), m.index))
    if (!/^\s*(?::|har\b|er\b|består av\b|blir\b|får\b)/i.test(cut)) {
      if (!/^\s*\d/.test(cut)) asked.push(k)
      return
    }
    let v: number | undefined
    const rows = /(\d+)\s+rader?\s+med\s+(\d+)/.exec(cut)
    if (cut.includes('=')) v = numbersOf(cut.slice(cut.lastIndexOf('=')))[0]
    else if (rows) v = Number(rows[1]) * Number(rows[2])
    else {
      const pairs = [...cut.matchAll(/(\d+)\s*(\p{L}*)/gu)]
      const byNoun = noun ? pairs.find((p) => p[2] && stem(p[2]) === stem(noun)) : undefined
      v = Number((byNoun ?? pairs[0])?.[1])
    }
    if (v !== undefined && Number.isFinite(v)) values.push({ k, v, claimedBy: claim?.[1] ?? '' })
  })
  return { values, asked }
}

/** Reglene som passer alle verdiene: lik økning, kvadrattall og trekanttall. */
function figureRules(values: FigureValue[], step?: number): FigureRule[] {
  const rules: FigureRule[] = []
  const sorted = [...values].sort((a, b) => a.k - b.k)
  if (sorted.length > 0) {
    const [first, second] = sorted
    const d = step ?? (second && second.k !== first.k ? (second.v - first.v) / (second.k - first.k) : NaN)
    if (Number.isInteger(d)) rules.push({ name: 'pluss', at: (k) => first.v + (k - first.k) * d })
  }
  rules.push({ name: 'kvadrattall', at: (k) => k * k }, { name: 'trekanttall', at: (k) => (k * (k + 1)) / 2 })
  return rules.filter((r) => values.every((x) => r.at(x.k) === x.v))
}

const isSquare = (n: number) => Number.isInteger(Math.sqrt(n))
const isTriangular = (n: number) => Number.isInteger((Math.sqrt(8 * n + 1) - 1) / 2)

function figureProblem(studentText: string, solution: string, found: Found = {}): PatternProblem | null {
  // «36 er (ikke) et kvadrattall»: alle slike utsagn i fasiten må stemme.
  for (const m of solution.matchAll(/(\d+) er (ikke )?et (kvadrattall|trekanttall)/gi)) {
    const truth = m[3].toLowerCase() === 'kvadrattall' ? isSquare(Number(m[1])) : isTriangular(Number(m[1]))
    if (truth === !!m[2]) return 'wrongSolution'
  }
  const single = /^\s*er (\d+) et (kvadrattall|trekanttall)\s*\?/i.exec(questionsOf(studentText)[0] ?? '')
  const conclusion = conclusionOf(solution)
  if (single && conclusion) {
    const truth = single[2].toLowerCase() === 'kvadrattall' ? isSquare(Number(single[1])) : isTriangular(Number(single[1]))
    if ((conclusion === 'ja') !== truth) return 'wrongConclusion'
  }

  const noun = /hvor mange (\p{L}+)/iu.exec(studentText)?.[1]
  const { values, asked } = figureValues(studentText, noun)
  const given = values.filter((v) => !v.claimedBy)
  if (given.length === 0) return /kvadrattall|trekanttall/i.test(studentText) ? null : 'missingInfo'

  // Prikkene appen tegner (se dotsFor): antallene må stå for figur 1, 2, 3 … uten hull og uten motsigelser, de må kunne
  // tegnes, og figuren det spørres etter skal ikke tegnes.
  if (showsDots(studentText)) {
    const counts = dotCountsIn(studentText)
    if (!counts) return 'missingInfo'
    if (counts.length > MAX_DOT_FIGURES || counts.some((c) => c > MAX_DOTS)) return 'outsideRange'
    if (!dotLayout(counts)) return 'wrongPattern'
    if (asked.some((k) => k <= counts.length)) return 'revealedSolution'
  }

  // Regelen: oppgitt i teksten («hver ny figur får 4 flere»), ellers ut fra minst tre figurer.
  const stated = /hver (?:ny )?figur får (\d+) (?:flere|nye|mer)|det kommer (\d+) (?:nye|flere)|(\d+) (?:flere|nye) (?:\p{L}+ )?(?:for|i) hver/iu.exec(studentText)
  const step = stated ? Number(stated[1] ?? stated[2] ?? stated[3]) : undefined
  if (step === undefined && new Set(given.map((g) => g.k)).size < 3) return 'missingInfo'
  let rules = figureRules(given, step)
  if (/kvadrattall/i.test(studentText) && !/trekanttall/i.test(studentText)) rules = rules.filter((r) => r.name !== 'trekanttall')
  if (rules.length === 0) return 'wrongPattern'
  const rule = rules[0]
  const askedAll = [...asked, ...values.filter((v) => v.claimedBy).map((v) => v.k)]
  if (rules.some((r) => askedAll.some((k) => r.at(k) !== rule.at(k)))) return 'ambiguousRule'

  // Påstander: hvem har rett, eller ja/nei.
  const claims = values.filter((v) => v.claimedBy)
  if (claims.length > 0) {
    const right = new Set(claims.filter((c) => rule.at(c.k) === c.v).map((c) => c.claimedBy))
    const named = /^\s*(\p{Lu}\p{Ll}+) har rett/u.exec(solution)?.[1]
    if (named && !right.has(named)) return 'wrongConclusion'
    if (/^\s*ingen\b/i.test(solution) && right.size > 0) return 'wrongConclusion'
    if (claims.length === 1 && conclusion && (conclusion === 'ja') !== right.has(claims[0].claimedBy)) return 'wrongConclusion'
  }

  // Verdiene i fasiten («Figur 10: 38 prikker», «figur 6 har 13») må følge regelen.
  const inSolution = figureValues(solution, noun).values
  if (inSolution.some((s) => rule.at(s.k) !== s.v)) return 'wrongSolution'

  // Figuren det spørres om.
  const targets = [...new Set(asked)].filter((k) => !given.some((g) => g.k === k))
  const questions = questionsOf(studentText).join(' ')
  const reverse = /hvilken figur har (\d+)/i.exec(questions)
  if (reverse) {
    const wanted = Number(reverse[1])
    let k = 1
    while (k < 200 && rule.at(k) < wanted) k++
    if (rule.at(k) !== wanted) return /^\s*(ingen|nei)\b/i.test(solution) ? null : 'wrongSolution'
    const answer = /figur\s+(\d+)/i.exec(solution)?.[1] ?? numbersOf(solution)[0]
    if (Number(answer) !== k) return 'wrongSolution'
    found.expected = { kind: 'number', value: k }
    return null
  }
  const unanswered = targets.filter((k) => !inSolution.some((s) => s.k === k))
  if (targets.length === 1 && claims.length === 0) {
    if (unanswered.length === 1 && numbersOf(solution)[0] !== rule.at(targets[0])) return 'wrongSolution'
    found.expected = { kind: 'number', value: rule.at(targets[0]) }
  } else if (targets.length > 1 && claims.length === 0 && unanswered.every((k) => numbersOf(solution).includes(rule.at(k)))) {
    found.expected = { kind: 'numbers', values: targets.map((k) => rule.at(k)) }
  } else if (unanswered.some((k) => !numbersOf(solution).includes(rule.at(k)))) return 'wrongSolution'
  return null
}

// ---------------------------------------------------------------------------------------------
// Tallfølger: «5, 10, 15, 20, __, __»

type Term = number | null

interface SequenceRule {
  name: 'pluss' | 'gange' | 'voksende hopp' | 'summen av de to forrige'
  /** Leddet på plass i (0, 1, 2 …). */
  at: (i: number) => number
  step?: number
}

const ITEM = String.raw`(?:\d+|_{2,}|□|\?)`
const SEQUENCE = new RegExp(String.raw`${ITEM}(?:[ \t]*,[ \t]*${ITEM})+(?:[ \t]*,?[ \t]*(?:…|\.\.\.))?`, 'g')

/** Den lengste tallfølgen i teksten (minst tre ledd). Tomme felt er null. */
export function sequenceIn(text: string): Term[] | null {
  let best: Term[] | null = null
  for (const m of text.matchAll(SEQUENCE)) {
    const items = m[0].replace(/(…|\.\.\.)\s*$/, '').split(',').map((s) => s.trim()).filter(Boolean)
    const terms = items.map((s) => (/^\d+$/.test(s) ? Number(s) : null))
    if (terms.length >= 3 && (!best || terms.length > best.length)) best = terms
  }
  return best
}

const known = (terms: Term[]) => terms.flatMap((v, i) => (v === null ? [] : [{ i, v }]))

/** Enkle regler som passer alle de kjente leddene. */
export function sequenceRules(terms: Term[]): SequenceRule[] {
  const points = known(terms)
  if (points.length < 2) return []
  const rules: SequenceRule[] = []
  const [p, q] = points
  const d = (q.v - p.v) / (q.i - p.i)
  if (Number.isInteger(d)) rules.push({ name: 'pluss', at: (i) => p.v + (i - p.i) * d, step: d })
  for (let r = 2; r <= 10; r++) {
    if (p.v > 0 && p.v * r ** (q.i - p.i) === q.v) rules.push({ name: 'gange', at: (i) => p.v * r ** (i - p.i), step: r })
  }
  if (points.length >= 3) {
    // Voksende hopp: leddet er et andregradsuttrykk i plassen (hoppene endres like mye hver gang).
    const [a, b, c] = points
    const f = (i: number) =>
      (a.v * (i - b.i) * (i - c.i)) / ((a.i - b.i) * (a.i - c.i)) + (b.v * (i - a.i) * (i - c.i)) / ((b.i - a.i) * (b.i - c.i)) + (c.v * (i - a.i) * (i - b.i)) / ((c.i - a.i) * (c.i - b.i))
    const at = (i: number) => Math.round(f(i) * 1e6) / 1e6
    const second = at(2) - 2 * at(1) + at(0)
    if (second !== 0 && Number.isInteger(at(0)) && Number.isInteger(at(1)) && Number.isInteger(second)) rules.push({ name: 'voksende hopp', at })
  }
  if (terms[0] !== null && terms[1] !== null && terms.some((t, i) => i >= 2 && t !== null && terms[i - 1] !== null && terms[i - 2] !== null)) {
    const [s0, s1] = [terms[0]!, terms[1]!]
    const memo = [s0, s1]
    const at = (i: number) => {
      while (memo.length <= i) memo.push(memo[memo.length - 1] + memo[memo.length - 2])
      return memo[i]
    }
    rules.push({ name: 'summen av de to forrige', at })
  }
  return rules.filter((rule) => points.every((x) => rule.at(x.i) === x.v))
}

/** Regelen oppgaven selv beskriver («øker med 6», «fortsetter med +4», «dobles»), eller null. */
function statedRule(text: string, terms: Term[]): SequenceRule | null {
  const add = /øker med (\d+)|(?:fortsetter|går) med \+\s?(\d+)|(\d+) mer hver gang|\+\s?(\d+) hver gang|legger til (\d+) hver gang/i.exec(text)
  const sub = /minker med (\d+)|(?:fortsetter|går) med [−-]\s?(\d+)|(\d+) mindre hver gang|[−-]\s?(\d+) hver gang|trekker fra (\d+) hver gang/i.exec(text)
  const mul = /dobles|blir dobbelt så/i.test(text) ? 2 : Number(/ganges med (\d+)|·\s?(\d+) hver gang/i.exec(text)?.slice(1).find(Boolean) ?? NaN)
  const start = Number(/starter på (\d+)/i.exec(text)?.[1] ?? terms.find((t) => t !== null) ?? NaN)
  const first = terms.findIndex((t) => t !== null)
  const base = { i: first < 0 ? 0 : first, v: start }
  if (!Number.isFinite(base.v)) return null
  if (add || sub) {
    const step = Number((add ?? sub)!.slice(1).find(Boolean)) * (add ? 1 : -1)
    return { name: 'pluss', at: (i) => base.v + (i - base.i) * step, step }
  }
  if (Number.isInteger(mul)) return { name: 'gange', at: (i) => base.v * mul ** (i - base.i), step: mul }
  return null
}

/** Det oppgaven spør om i tallfølgen: tomme felt, de neste leddene og ledd nummer K (plass 0, 1 …). */
function askedPositions(studentText: string, terms: Term[]): number[] {
  const blanks = terms.flatMap((t, i) => (t === null ? [i] : []))
  if (blanks.length > 0) return blanks
  const questions = questionsOf(studentText).join(' ')
  const next = /(?:de |det )?(\p{L}+|\d+)?\s*neste (?:tall|tallene|leddene|ledd)/iu.exec(questions)
  if (next) {
    const count = next[1] ? (numberWord(next[1]) ?? 1) : 1
    return Array.from({ length: count }, (_, j) => terms.length + j)
  }
  const nth = /(?:tall|ledd) nummer (\d+)|det (\d+)\. tallet/i.exec(questions)
  if (nth) return [Number(nth[1] ?? nth[2]) - 1]
  return []
}

function sequenceProblem(studentText: string, solution: string, found: Found = {}): PatternProblem | null {
  // Eleven lager følger selv: hver følge i fasiten må ha en enkel regel.
  if (OPEN_TASK.test(studentText)) {
    for (const m of solution.matchAll(SEQUENCE)) {
      const terms = sequenceIn(m[0])
      if (terms && terms.length >= 4 && sequenceRules(terms).length === 0) return 'wrongPattern'
    }
    return null
  }
  const terms = sequenceIn(studentText)
  if (!terms) return 'missingInfo'
  if (/finn feil|feilen|er feil/i.test(studentText)) return null

  const stated = statedRule(studentText, terms)
  const points = known(terms)
  let rules: SequenceRule[]
  if (stated) {
    if (!points.every((x) => stated.at(x.i) === x.v)) return 'wrongPattern'
    rules = [stated]
  } else {
    rules = sequenceRules(terms)
    if (rules.length === 0) return 'wrongPattern'
  }
  // Flere enkle regler som gir ulike svar (2, 4, 8 kan være · 2 eller +2, +4, +6): regelen er ikke entydig.
  const asked = askedPositions(studentText, terms)
  const probe = asked.length > 0 ? asked : [terms.length, terms.length + 1]
  if (rules.some((r) => probe.some((i) => r.at(i) !== rules[0].at(i)))) return 'ambiguousRule'
  // Nok ledd: minst fire kjente – eller tre på en tallinje med tomme felt inni og lik økning – når regelen ikke er beskrevet.
  const interior = terms.some((t, i) => t === null && i < terms.length - 1)
  if (!stated && points.length < 4 && !(points.length >= 3 && interior && rules.every((r) => r.name === 'pluss'))) return 'missingInfo'
  const rule = rules[0]

  const expected = asked.map((i) => rule.at(i))
  if (expected.some((v) => v < 0 || !Number.isInteger(v))) return 'outsideRange'
  if (expected.length > 0 && !containsRun(numbersOf(solution), expected)) return 'wrongSolution'

  // Regelen som står i fasiten («Regelen er +3», «· 2»), må være regelen som passer.
  const said = /regelen er\s*([+−-]|·|x|ganger)\s*(\d+)/i.exec(solution)
  if (said) {
    const sign = said[1]
    const n = Number(said[2])
    const fits = sign === '+' ? rule.name === 'pluss' && rule.step === n : sign === '·' || sign === 'x' || sign === 'ganger' ? rule.name === 'gange' && rule.step === n : rule.name === 'pluss' && rule.step === -n
    if (!fits) return 'wrongSolution'
  }

  // Påstander og spørsmål om alle leddene.
  const conclusion = conclusionOf(solution)
  const member = /kommer (?:tallet )?(\d+)|er (\d+) (?:med )?i (?:tall)?følgen/i.exec(questionsOf(studentText).join(' '))
  if (member && conclusion) {
    const target = Number(member[1] ?? member[2])
    const list = Array.from({ length: 200 }, (_, i) => rule.at(i))
    if ((conclusion === 'ja') !== list.includes(target)) return 'wrongConclusion'
  }
  const parity = /alle tallene (?:i (?:tall)?følgen )?(?:blir|er) (oddetall|partall)/i.exec(studentText)
  if (parity && conclusion) {
    const odd = parity[1].toLowerCase() === 'oddetall'
    const truth = Array.from({ length: 30 }, (_, i) => rule.at(i)).every((v) => (v % 2 === 1) === odd)
    if ((conclusion === 'ja') !== truth) return 'wrongConclusion'
  }
  // Tallene som mangler eller kommer etter (ikke ja/nei-spørsmål og påstander).
  if (expected.length > 0 && !member && !parity && !ASSESSMENT.test(studentText)) {
    found.expected = expected.length === 1 && !terms.some((t) => t === null) ? { kind: 'number', value: expected[0] } : { kind: 'numbers', values: expected }
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Pseudokode: kommandoene i kodeformatet, innrykk på fire mellomrom, ingen ekte programmeringsspråk.

type Condition = { kind: 'tall'; test: (x: number) => boolean } | { kind: 'situasjon'; text: string }

type Node =
  | { kind: 'gjenta'; times: number | null; body: Node[] }
  | { kind: 'hvis'; condition: Condition; then: Node[]; otherwise: Node[] | null }
  | { kind: 'kommando'; name: string; arg: number | string | null }

/** Ekte programmeringsspråk, blokkprogrammering og det kodeformatet ikke har (variabler, funksjoner, lister). */
const REAL_CODE =
  /\b(print|input|range|def|elif|while|repeat|console\.log|function|return|import|forever)\b|\bfor\s+\p{L}+\s+in\b|[{}[\]]|;\s*$|==|!=|\+=|-=|\*=|&&|\|\||\bpython\b|\bscratch\b|\bjavascript\b|\bjava\b|blokkprogrammering|grønt flagg|\bfunksjon\w*|\bvariabel\w*|\blister?\b|(^|\n)\s*\p{L}[\p{L}\d_]*\s*=\s*[\p{L}\d]/imu
/** Engelske nøkkelord med liten forbokstav først på en linje («if x > 3:», «else:») – ikke «For eksempel». */
const REAL_CODE_LINE = /(^|\n)\s*(if|else|for|then|end|True|False|None)\b/u

const COMMAND_WORD = /^(gjenta|hvis|ellers|legg til|legg det i|trekk fra|gang tallet med|si|tegn|gå|snu|klapp|stamp|ta med)\b/
const NUMBER_OR_BLANK = String.raw`(\d+|_{2,})`

/** Om linja er en kodelinje: innrykket, en kontrollinje med kolon, eller en kommando med liten forbokstav (uten komma). */
function isCodeLine(line: string) {
  if (/^ +\S/.test(line) || /^\t/.test(line)) return true
  const t = line.trim()
  if (/^(gjenta|hvis|ellers)\b.*:$/i.test(t)) return true
  return COMMAND_WORD.test(t) && !t.includes(',')
}

/** Kodeblokkene i teksten (sammenhengende kodelinjer). */
export function codeBlocks(text: string): string[][] {
  const blocks: string[][] = []
  let current: string[] = []
  for (const line of text.split('\n')) {
    if (line.trim() && isCodeLine(line)) current.push(line.replace(/\s+$/, ''))
    else if (current.length) {
      blocks.push(current)
      current = []
    }
  }
  if (current.length) blocks.push(current)
  return blocks
}

const n = (s: string) => (/^_+$/.test(s) ? null : Number(s))

/** Vilkåret i «hvis …:», eller null når det ikke har et tydelig kriterium. */
export function parseCondition(text: string): Condition | null {
  const t = text.trim().toLowerCase()
  if (/^det (regner|snør|er sol|er kaldt|er varmt|blåser)$/.test(t)) return { kind: 'situasjon', text: t }
  const m = /^(\p{L}+) er (et partall|et oddetall|større enn (\d+)|mindre enn (\d+)|over (\d+)|under (\d+)|minst (\d+)|høyst (\d+)|lik (\d+)|i (\p{L}+)gangen|(\d+))(?: (?:grader|år|steg|poeng))?$/u.exec(t)
  if (!m || !/^(tallet|alderen|temperaturen|svaret|summen|antallet|poengene|poengsummen)$/.test(m[1])) return null
  const [, , what] = m
  const k = Number(m[3] ?? m[4] ?? m[5] ?? m[6] ?? m[7] ?? m[8] ?? m[9] ?? m[11])
  if (what === 'et partall') return { kind: 'tall', test: (x) => x % 2 === 0 }
  if (what === 'et oddetall') return { kind: 'tall', test: (x) => x % 2 === 1 }
  if (m[3] || m[5]) return { kind: 'tall', test: (x) => x > k }
  if (m[4] || m[6]) return { kind: 'tall', test: (x) => x < k }
  if (m[7]) return { kind: 'tall', test: (x) => x >= k }
  if (m[8]) return { kind: 'tall', test: (x) => x <= k }
  if (m[10]) {
    const table = TABLE_WORDS[m[10]]
    return table ? { kind: 'tall', test: (x) => x % table === 0 } : null
  }
  return { kind: 'tall', test: (x) => x === k }
}

/** En kommando i kodeformatet, eller null. */
function parseCommand(t: string): Node | null {
  let m: RegExpExecArray | null
  if ((m = new RegExp(`^legg til ${NUMBER_OR_BLANK}$`).exec(t))) return { kind: 'kommando', name: 'legg til', arg: n(m[1]) }
  if ((m = new RegExp(`^trekk fra ${NUMBER_OR_BLANK}$`).exec(t))) return { kind: 'kommando', name: 'trekk fra', arg: n(m[1]) }
  if ((m = new RegExp(`^gang tallet med ${NUMBER_OR_BLANK}$`).exec(t))) return { kind: 'kommando', name: 'gang', arg: n(m[1]) }
  if ((m = /^si «([^»]+)»$/.exec(t))) return { kind: 'kommando', name: 'si', arg: m[1] }
  if ((m = /^tegn ((?:[●■▲]|\p{L}+)(?: \p{L}+){0,2})$/u.exec(t))) return { kind: 'kommando', name: 'tegn', arg: m[1] }
  if (/^gå fram$/.test(t)) return { kind: 'kommando', name: 'gå', arg: 1 }
  if ((m = new RegExp(`^gå ${NUMBER_OR_BLANK} steg fram$`).exec(t))) return { kind: 'kommando', name: 'gå', arg: n(m[1]) }
  if (/^snu til høyre$/.test(t)) return { kind: 'kommando', name: 'snu', arg: null }
  if ((m = /^(klapp|stamp)$/.exec(t))) return { kind: 'kommando', name: m[1], arg: m[1] }
  if ((m = /^ta med (\p{L}+)$/u.exec(t))) return { kind: 'kommando', name: 'ta med', arg: m[1] }
  if ((m = /^legg det i (kurv|gruppe|boks) (\p{L}|\d+)$/u.exec(t))) return { kind: 'kommando', name: 'sorter', arg: `${m[1]} ${m[2].toUpperCase()}` }
  return null
}

/**
 * Leser en kodeblokk. Feil gir en kort beskrivelse: ukjent kommando, uklart vilkår, innrykk som ikke er fire
 * mellomrom per nivå, «ellers» uten «hvis», tom løkke eller nøstede løkker.
 */
export function parseProgram(lines: string[]): { program: Node[] } | { error: string } {
  const rows = lines.map((line) => ({ indent: line.length - line.trimStart().length, text: line.trim(), tab: /^\s*\t/.test(line) }))
  if (rows.some((r) => r.tab)) return { error: 'tabulator i innrykket' }
  if (rows.some((r) => r.indent % 4 !== 0)) return { error: 'innrykket er ikke fire mellomrom' }
  if (rows[0]?.indent !== 0) return { error: 'koden starter med innrykk' }
  let pos = 0
  const block = (indent: number, inLoop: boolean): Node[] | string => {
    const nodes: Node[] = []
    while (pos < rows.length && rows[pos].indent >= indent) {
      const row = rows[pos]
      if (row.indent > indent) return 'innrykk uten løkke eller vilkår over'
      const lower = row.text.replace(/^(Gjenta|Hvis|Ellers)\b/, (w) => w.toLowerCase())
      pos++
      const loop = new RegExp(`^gjenta ${NUMBER_OR_BLANK} ganger:$`).exec(lower)
      const cond = /^hvis (.+):$/.exec(lower)
      if (loop) {
        if (inLoop) return 'nøstede løkker'
        if (pos >= rows.length || rows[pos].indent !== indent + 4) return 'løkka har ikke innrykk på fire mellomrom'
        const body = block(indent + 4, true)
        if (typeof body === 'string') return body
        nodes.push({ kind: 'gjenta', times: n(loop[1]), body })
      } else if (cond) {
        const condition = parseCondition(cond[1])
        if (!condition) return `uklart vilkår «${cond[1]}»`
        if (pos >= rows.length || rows[pos].indent !== indent + 4) return 'vilkåret har ikke innrykk på fire mellomrom'
        const then = block(indent + 4, inLoop)
        if (typeof then === 'string') return then
        let otherwise: Node[] | null = null
        if (pos < rows.length && rows[pos].indent === indent && /^ellers:$/i.test(rows[pos].text)) {
          pos++
          if (pos >= rows.length || rows[pos].indent !== indent + 4) return '«ellers» har ikke innrykk på fire mellomrom'
          const body = block(indent + 4, inLoop)
          if (typeof body === 'string') return body
          otherwise = body
        }
        nodes.push({ kind: 'hvis', condition, then, otherwise })
      } else if (/^ellers:$/i.test(lower)) {
        return '«ellers» uten «hvis»'
      } else {
        const command = parseCommand(row.text)
        if (!command) return `ukjent kommando «${row.text}»`
        nodes.push(command)
      }
    }
    return nodes
  }
  const program = block(0, false)
  if (typeof program === 'string') return { error: program }
  if (pos < rows.length) return { error: 'innrykk som ikke passer' }
  return { program }
}

export interface RunResult {
  value: number | null
  /** Tallet etter hver runde i den ytterste løkka. */
  rounds: number[]
  /** Det programmet sier, tegner eller gjør, i rekkefølge («ja», «●», «klapp», «kurv A» …). */
  outputs: string[]
  steps: number
  turns: number
  /** Lengden på hver strekning roboten går mellom svingene, og om den ender der den startet. */
  segments: number[]
  home: boolean
  /** Programmet har tomme felt («__») og kan ikke kjøres. */
  incomplete: boolean
  /** Tallet ble negativt eller ikke et helt tall. */
  invalidValue: boolean
  /** Programmet trenger et tall, men oppgaven oppgir ikke noe. */
  needsValue: boolean
}

/** Kjører programmet med starttallet (eller tallet vilkåret gjelder). Situasjonsvilkår («det regner») får `situation`. */
export function runProgram(program: Node[], start: number | null, situation = true): RunResult {
  const r: RunResult = { value: start, rounds: [], outputs: [], steps: 0, turns: 0, segments: [], home: true, incomplete: false, invalidValue: false, needsValue: false }
  let [x, y, dir, segment] = [0, 0, 0, 0]
  const exec = (nodes: Node[], top: boolean) => {
    for (const node of nodes) {
      if (node.kind === 'gjenta') {
        if (node.times === null) {
          r.incomplete = true
          return
        }
        for (let i = 0; i < node.times; i++) {
          exec(node.body, false)
          if (top && r.value !== null) r.rounds.push(r.value)
        }
      } else if (node.kind === 'hvis') {
        let truth = situation
        if (node.condition.kind === 'tall') {
          if (r.value === null) {
            r.needsValue = true
            return
          }
          truth = node.condition.test(r.value)
        }
        if (truth) exec(node.then, top)
        else if (node.otherwise) exec(node.otherwise, top)
      } else {
        const { name, arg } = node
        if (['legg til', 'trekk fra', 'gang'].includes(name)) {
          if (arg === null) {
            r.incomplete = true
            continue
          }
          if (r.value === null) {
            r.needsValue = true
            continue
          }
          const k = Number(arg)
          r.value = name === 'legg til' ? r.value + k : name === 'trekk fra' ? r.value - k : r.value * k
          if (r.value < 0 || !Number.isInteger(r.value)) r.invalidValue = true
        } else if (name === 'gå') {
          if (arg === null) {
            r.incomplete = true
            continue
          }
          const k = Number(arg)
          r.steps += k
          segment += k
          ;[x, y] = [x + [0, 1, 0, -1][dir] * k, y + [1, 0, -1, 0][dir] * k]
        } else if (name === 'snu') {
          r.turns++
          if (segment > 0) r.segments.push(segment)
          segment = 0
          dir = (dir + 1) % 4
        } else r.outputs.push(String(arg))
      }
    }
  }
  exec(program, true)
  if (segment > 0) r.segments.push(segment)
  r.home = x === 0 && y === 0
  return r
}

const programNodes = (nodes: Node[]): Node[] => nodes.flatMap((node) => [node, ...(node.kind === 'gjenta' ? programNodes(node.body) : node.kind === 'hvis' ? [...programNodes(node.then), ...programNodes(node.otherwise ?? [])] : [])])
const hasLoop = (program: Node[]) => programNodes(program).some((node) => node.kind === 'gjenta')
const hasCondition = (program: Node[]) => programNodes(program).some((node) => node.kind === 'hvis')
const usesValue = (program: Node[]) =>
  programNodes(program).some((node) => (node.kind === 'kommando' && ['legg til', 'trekk fra', 'gang'].includes(node.name)) || (node.kind === 'hvis' && node.condition.kind === 'tall'))

/** Tallene programmet kjøres med: starttall og tallene spørsmålene nevner («når tallet er 8», «for tallene 15, 10 og 3»). */
function inputsOf(studentText: string): number[] {
  const inputs: number[] = []
  const list = (text: string) => numbersOf(text)
  for (const m of studentText.matchAll(/\bstart(?:er)?(?: du)? (?:med|på) (\d+)|\bnår (?:tallet|alderen|temperaturen) er (\d+)|\bsom er (\d+) år|\b(?:for|med) tallet (\d+)/gi)) {
    inputs.push(Number(m[1] ?? m[2] ?? m[3] ?? m[4]))
  }
  const many = /\btallene (\d+(?:\s*(?:,|og)\s*\d+)+)/i.exec(studentText)
  if (many) inputs.push(...list(many[1]))
  return [...new Set(inputs)]
}

/** Løkker og vilkår skrevet i en setning i fasiten («gjenta 5 ganger: legg til 4», «gjenta 3 ganger med to «tegn stjerne»»). */
function inlinePrograms(solution: string) {
  const loops = [...solution.matchAll(/gjenta (\d+) ganger:?\s*(legg til|trekk fra) (\d+)/gi)].map((m) => ({ times: Number(m[1]), sign: m[2].toLowerCase() === 'legg til' ? 1 : -1, step: Number(m[3]) }))
  const draws = [...solution.matchAll(/gjenta (\d+) ganger med (\p{L}+|\d+) «tegn (\p{L}+)»/giu)].map((m) => ({ times: Number(m[1]), each: numberWord(m[2]) ?? NaN, what: m[3] }))
  const conditions = [...solution.matchAll(/hvis (.+?)(?::\s|,\s)/gi)].map((m) => parseCondition(m[1]))
  return { loops, draws, conditions }
}

/** Det programmet skal gjøre, slik oppgaven beskriver det («si «for kaldt» når temperaturen er under 5 grader»). */
function specifiedCondition(studentText: string): { condition: Condition; output: string } | null {
  const m = /si «([^»]+)»(?: når| til \p{L}+ som| hvis)? (?:(\p{L}+) )?er (.+?)(?:,|\.|\s+og\s)/iu.exec(studentText)
  if (!m) return null
  const condition = parseCondition(`${m[2] ?? 'tallet'} er ${m[3]}`)
  return condition ? { condition, output: m[1] } : null
}

const sameCondition = (a: Condition, b: Condition) => a.kind === 'tall' && b.kind === 'tall' && Array.from({ length: 101 }, (_, x) => x).every((x) => a.test(x) === b.test(x))

/** Ordene for handlinger i fasiten («klapp, stamp, klapp …»), i rekkefølge. */
const actionWords = (solution: string, vocabulary: Set<string>) => (solution.toLowerCase().match(/[\p{L}●■▲]+/gu) ?? []).filter((w) => vocabulary.has(w))

/** Delen av fasiten som handler om `input` (fra tallet til neste tall som også er et inndata). */
function segmentFor(solution: string, input: number, inputs: number[]) {
  const at = new RegExp(`(?<!\\d)${input}(?!\\d)`).exec(solution)
  if (!at) return null
  const rest = solution.slice(at.index + String(input).length)
  const others = inputs.filter((i) => i !== input).map((i) => new RegExp(`(?<!\\d)${i}(?!\\d)`).exec(rest)?.index ?? Infinity)
  return rest.slice(0, Math.min(rest.length, ...others))
}

function codeProblem(studentText: string, solution: string, area: PatternArea, level: number, found: Found = {}): PatternProblem | null {
  const studentBlocks = codeBlocks(studentText)
  const solutionBlocks = codeBlocks(solution)
  const parsed = [...studentBlocks, ...solutionBlocks].map(parseProgram)
  if (parsed.some((p) => 'error' in p)) return 'invalidCode'
  const programs = parsed.map((p) => (p as { program: Node[] }).program)
  const studentPrograms = programs.slice(0, studentBlocks.length)
  const solutionPrograms = programs.slice(studentBlocks.length)

  // Fagområdet: løkker uten vilkår, eller vilkår (eventuelt inne i en løkke).
  const loops = programs.some(hasLoop) || /«gjenta»|\bgjenta \d+ ganger\b/i.test(studentText + solution)
  const conditions = programs.some(hasCondition) || /«hvis»|\bhvis \p{L}+ er\b/iu.test(studentText + solution)
  if (area === 'koder-lokker' && (!loops || conditions)) return 'wrongArea'
  if (area === 'koder-vilkar' && !conditions) return 'wrongArea'
  if (studentPrograms.length === 0 && !OPEN_TASK.test(studentText) && solutionPrograms.length === 0 && !/«(gjenta|hvis)»/.test(studentText)) return 'missingFigure'

  // Nivå 1: én løkke eller ett vilkår – ikke vilkår inne i en løkke, og ingen feilsøking.
  if (level === 1 && (programs.some((p) => hasLoop(p) && hasCondition(p)) || ASSESSMENT.test(studentText))) return 'levelMismatch'

  const questions = questionsOf(studentText).join(' ')
  const program = studentPrograms[0]
  const inputs = inputsOf(studentText)
  const errorTask = ASSESSMENT.test(studentText)

  if (program) {
    const runs = (inputs.length ? inputs : [null]).map((input) => ({ input, result: runProgram(program, input) }))
    const first = runs[0].result
    if (!first.incomplete) {
      if (first.needsValue && runs[0].input === null) return 'missingInfo'
      if (runs.some((r) => r.result.invalidValue)) return 'outsideRange'
      const valueProgram = usesValue(program) && runs.every((r) => r.result.value !== null) && first.outputs.length === 0

      // Tallet etter hver runde, og tallet til slutt.
      const perRound = /etter hver runde|etter hver gang/i.test(questions)
      if (perRound && !containsRun(numbersOf(solution), first.rounds)) return 'wrongSolution'
      if (perRound && !errorTask && runs.length === 1 && first.rounds.length > 0) found.expected = { kind: 'numbers', values: first.rounds }
      if (valueProgram && runs.length === 1 && !errorTask && (!perRound || /til slutt|ender på/i.test(solution))) {
        const expected = first.value!
        const final = /(?:til slutt|ender på|blir|får du)\D{0,12}?(\d+)/i.exec(solution)?.[1]
        const answer = final !== undefined && /til slutt|ender på/i.test(solution) ? Number(final) : numbersOf(solution)[0]
        if (answer !== expected && !(final !== undefined && Number(final) === expected)) return 'wrongSolution'
        if (!perRound) found.expected = { kind: 'number', value: expected }
        if (new RegExp(`(?:til slutt|svaret)\\s+(?:er|blir)\\s+${expected}(?!\\d)`, 'i').test(studentText)) return 'revealedSolution'
      }
      if (valueProgram && runs.length > 1) {
        for (const { input, result } of runs) {
          const part = segmentFor(solution, input!, inputs)
          if (part === null || numbersOf(part).at(-1) !== result.value) return 'wrongSolution'
        }
      }

      // Det programmet sier eller sorterer for hvert tall – også i grensetilfeller.
      const says = runs.length > 1 && runs.every((r) => r.result.outputs.length > 0)
      if (says) {
        const labels = [...new Set(runs.flatMap((r) => r.result.outputs))]
        if (labels.every((l) => /^(kurv|gruppe|boks) /.test(l))) {
          for (const label of labels) {
            const at = solution.toLowerCase().indexOf(label.toLowerCase())
            if (at < 0) return 'wrongSolution'
            const after = solution.slice(at + label.length)
            const next = Math.min(...labels.filter((l) => l !== label).map((l) => after.toLowerCase().indexOf(l.toLowerCase())).filter((i) => i >= 0), after.length)
            const listed = numbersOf(after.slice(0, next))
            if (!sameSet(listed, runs.filter((r) => r.result.outputs.includes(label)).map((r) => r.input!))) return 'wrongSolution'
          }
        } else {
          for (const { input, result } of runs) {
            const part = segmentFor(solution, input!, inputs)?.toLowerCase()
            const wanted = result.outputs.join(' ').toLowerCase()
            const others = labels.filter((l) => !result.outputs.includes(l)).map((l) => l.toLowerCase())
            if (part === undefined || part === null || !part.includes(wanted) || others.some((o) => !wanted.includes(o) && part.includes(o))) return 'wrongSolution'
          }
        }
      }

      // Alt som skjer, i rekkefølge (klapp, stamp …), og antallet programmet tegner eller går.
      const vocabulary = new Set(first.outputs.map((o) => o.toLowerCase()))
      if (!errorTask && runs.length === 1 && first.outputs.length > 0 && /rekkefølge|alt som skjer|hva skjer|hva gjør|hva tegner/i.test(questions)) {
        if (!containsRun(actionWords(solution, vocabulary), first.outputs.map((o) => o.toLowerCase()))) return 'wrongSolution'
      }
      const howMany = /hvor mange (\p{L}+)/iu.exec(questions)
      if (howMany) {
        const word = stem(howMany[1])
        const expected = word === 'steg' ? first.steps : word === 'gang' ? null : first.outputs.filter((o) => stem(o) === word).length
        if (expected !== null && (word === 'steg' || expected > 0) && numbersOf(firstSentence(solution))[0] !== expected && numbersOf(solution)[0] !== expected) return 'wrongSolution'
        if (expected !== null && (word === 'steg' || expected > 0) && !errorTask && !/rett|skriv (et|programmet)/i.test(studentText)) found.expected = { kind: 'number', value: expected }
      }

      // Det samme programmet skrevet kortere.
      if (/samme programmet|kortere/i.test(studentText) && solutionPrograms[0]) {
        const other = runProgram(solutionPrograms[0], runs[0].input)
        if (JSON.stringify({ ...other, rounds: [] }) !== JSON.stringify({ ...first, rounds: [] })) return 'wrongSolution'
        if (!hasLoop(solutionPrograms[0])) return 'wrongSolution'
      }
    }
  }

  // Fasiten fyller inn tomme felt i programmet: resten av koden må være lik.
  if (studentBlocks[0] && studentBlocks[0].some((l) => /_{2,}/.test(l))) {
    const filled = solutionBlocks[0]
    if (!filled || filled.length !== studentBlocks[0].length) return 'wrongSolution'
    const fits = studentBlocks[0].every((line, i) => new RegExp(`^${line.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_{2,}/g, '\\d+')}$`).test(filled[i].trim()))
    if (!fits) return 'wrongSolution'
  }

  // Programmer i fasiten må gjøre det oppgaven ber om.
  for (const solved of solutionPrograms) {
    const start = inputsOf(studentText)[0] ?? null
    const result = runProgram(solved, start)
    if (result.incomplete) return 'wrongSolution'
    if (result.invalidValue) return 'outsideRange'
    const square = /kvadrat/i.exec(studentText) && /hver side er (\d+) steg/i.exec(studentText)
    if (square && (result.segments.length !== 4 || result.segments.some((s) => s !== Number(square[1])) || !result.home)) return 'wrongSolution'
    const pattern = /tegner dette mønsteret|tegne dette mønsteret|lager dette mønsteret/i.test(studentText) ? patternsIn(studentText)[0] : null
    if (pattern && result.outputs.join(' ') !== pattern.join(' ')) return 'wrongSolution'
  }

  // Mål oppgaven gir: tegne N av noe, eller starte på A og ende på B.
  const draw = /(?:skal|vil at programmet skal|slik at det) tegne[rs]? (\d+) (\p{L}+)/iu.exec(studentText)
  const inline = inlinePrograms(solution)
  if (draw) {
    const target = Number(draw[1])
    const counts = [...solutionPrograms.map((p) => runProgram(p, null).outputs.filter((o) => stem(o) === stem(draw[2])).length), ...inline.draws.map((d) => d.times * d.each)]
    if (counts.some((c) => c !== target)) return 'wrongSolution'
    // Feilsøking: antallet det opprinnelige programmet tegner, står først i fasiten.
    if (program && errorTask && /hvor mange/i.test(questions)) {
      const actual = runProgram(program, null).outputs.filter((o) => stem(o) === stem(draw[2])).length
      if (numbersOf(firstSentence(solution))[0] !== actual) return 'wrongSolution'
    }
  }
  const fromTo = /starter på (\d+) og ender på (\d+)/i.exec(studentText)
  if (fromTo) {
    const [a, b] = [Number(fromTo[1]), Number(fromTo[2])]
    const ends = [...solutionPrograms.map((p) => runProgram(p, a).value), ...inline.loops.map((l) => a + l.sign * l.times * l.step)]
    if (ends.length === 0 && !OPEN_TASK.test(studentText)) return 'unclearSolution'
    if (ends.some((e) => e !== b)) return 'wrongSolution'
  }

  // Vilkåret oppgaven beskriver («si «gratis billett» til barn som er under 6 år»): det rettede eller skrevne
  // vilkåret må velge samme gren for alle tall – også grensetilfellet.
  const spec = specifiedCondition(studentText)
  if (spec && spec.condition.kind === 'tall') {
    const written = [
      ...solutionPrograms.flatMap((p) => programNodes(p).filter((x): x is Extract<Node, { kind: 'hvis' }> => x.kind === 'hvis').map((x) => x.condition)),
      ...inline.conditions.filter((c): c is Condition => c !== null),
    ]
    if (written.length === 0 && /rett|skriv (programmet|et program)/i.test(studentText)) return 'unclearSolution'
    if (written.some((c) => !sameCondition(c, spec.condition))) return 'wrongSolution'
    // «Hva sier ditt program til et barn som er 6 år?»: «ikke» i svaret må stemme med vilkåret.
    const asked = /som er (\d+) år\s*\?|når (?:tallet|temperaturen) er (\d+)[^?]*\?/i.exec(questions)
    if (asked && written.length > 0) {
      const value = Number(asked[1] ?? asked[2])
      const sentence = sentencesOf(solution).find((s) => new RegExp(`(?<!\\d)${value}(?!\\d)`).test(s) && !/^\s*(riktig|hvis)\b/i.test(s) && !/hvis /i.test(s))
      if (sentence && /\bikke\b/i.test(sentence.split(/fordi/i)[0]) === spec.condition.test(value)) return 'wrongConclusion'
    }
  }

  // Eleven lager en sorteringsregel: tallene i hver gruppe må følge vilkåret i fasiten.
  const sorting = /sorterer tallene ([\d, og]+)/i.exec(studentText)
  if (sorting && OPEN_TASK.test(studentText)) {
    const numbers = numbersOf(sorting[1])
    const condition = inline.conditions[0] ?? solutionPrograms.flatMap((p) => programNodes(p).filter((x): x is Extract<Node, { kind: 'hvis' }> => x.kind === 'hvis').map((x) => x.condition))[0]
    if (!condition || condition.kind !== 'tall') return 'unclearSolution'
    const groups = [...solution.matchAll(/gruppe (\d|\p{L}+)\s*:\s*([\d, og]+)/giu)].map((m) => numbersOf(m[2]))
    if (groups.length < 2) return 'unclearSolution'
    if (!sameSet(groups[0], numbers.filter((x) => condition.test(x))) || !sameSet(groups[1], numbers.filter((x) => !condition.test(x)))) return 'wrongSolution'
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Hele kontrollen

export type PatternKind = 'gjentakende' | 'figurtall' | 'tallfolge' | 'kode'

const KINDS_OF_AREA: Record<PatternArea, PatternKind> = {
  'utforske-monster': 'gjentakende',
  figurtall: 'figurtall',
  tallfolger: 'tallfolge',
  'koder-lokker': 'kode',
  'koder-vilkar': 'kode',
}

/** Hva slags oppgave det er: kode, gjentakende mønster, figurtall eller tallfølge – eller null. */
export function kindOf(studentText: string, solution: string): PatternKind | null {
  if (codeBlocks(studentText).length > 0 || codeBlocks(solution).length > 0 || /\b(programmet|program|koden|kode|løkka|løkke)\b|«gjenta»|«hvis»/i.test(studentText)) return 'kode'
  if (patternsIn(studentText).length > 0 || (/\bmønster/i.test(studentText) && patternsIn(solution).length > 0)) return 'gjentakende'
  if (/\bfigur\s*\d+\s*(?:har|er|:)|kvadrattall|trekanttall|figurtall/i.test(studentText)) return 'figurtall'
  if (sequenceIn(studentText) || /tallfølge|tallrekke|tallinje/i.test(studentText)) return 'tallfolge'
  return null
}

/** Negative tall som verdier – ikke regler som «−4» eller «trekk fra 2». */
const NEGATIVE = /(?:=\s*|,\s*|\b(?:blir|ender på|slutt er|tallet er|svaret er|starter på|start med)\s+)[-−]\s?\d|\bminus \d|under null|minusgrader/i
const DECIMAL = /(?<![\d,])\d+[,.]\d+(?![\d,])/
/** Innhold som ikke hører til Mønster og algoritmer. */
const OFF_TOPIC = /\bbrøk|\bprosent|\bkroner\b|\bkr\b|(?<!\p{L})(cm|mm|km|kg|dl|liter|meter|gram|cm²|m²)(?!\p{L})|\bareal|\bomkrets|\bvinkel/iu
/** Henvisning til kode som ikke står i teksten. */
const MISSING_CODE = /\b(koden|programmet|kodeblokk\w*|blokkene|mønsteret) (under|over|nedenfor|ovenfor|på bildet)\b|\bse (på )?(blokkene|kodeblokk\w*|bildet|tabellen)\b/i
const REVEALED = /\b(svaret|fasiten|riktig svar) (er|blir)\s*\S/i

/**
 * Kontrollerer én AI-oppgave i Mønster og algoritmer. Rekkefølge: format (bare tekstoppgaver), ekte programkode,
 * figurtegn appen ikke bruker, negative tall og desimaltall, innhold utenfor temaet, tallområdet, figurer og kode som
 * ikke vises, fagområdet i økta, nivået og til slutt den faglige kontrollen for oppgavetypen.
 */
export function patternProblem(task: AiTaskDraft, { area, secondaryAreas = [], existingMax = 0, found = {} }: PatternContext): PatternProblem | null {
  // Regnestykker viser utregningen under instruksjonen («16 + 4 = ___») og avslører regelen eller programmet.
  if (isMathDraft(task)) return 'format'
  const { studentText, solution, level } = task
  const all = `${studentText}\n${solution}`

  if (REAL_CODE.test(all) || REAL_CODE_LINE.test(all)) return 'invalidCode'
  if (OTHER_SHAPES.test(all)) return 'invalidVisual'
  if (NEGATIVE.test(all) || DECIMAL.test(all)) return 'outsideRange'
  if (OFF_TOPIC.test(all)) return 'offTopic'
  const areas = [area, ...secondaryAreas]
  const refLimit = Math.max(...areas.map((a) => numberLimit(a, level, patternReferences)))
  const limit = Math.max(refLimit, existingMax > 0 ? 10 ** Math.ceil(Math.log10(existingMax + 1)) : 0)
  if (numbersOf(all).some((x) => x > limit)) return 'outsideRange'
  if (MISSING_FIGURE.test(studentText) || (MISSING_CODE.test(studentText) && codeBlocks(studentText).length === 0 && patternsIn(studentText).length === 0)) return 'missingFigure'

  const kind = kindOf(studentText, solution)
  if (!kind) return 'offTopic'
  if (!areas.some((a) => KINDS_OF_AREA[a] === kind)) return 'wrongArea'
  const assessment = ASSESSMENT.test(studentText)
  if (level === 1 && assessment) return 'levelMismatch'
  if (!assessment && REVEALED.test(studentText)) return 'revealedSolution'

  // Oppgaver der eleven lager, vurderer eller retter noe, har ikke ett kort svar som kan rettes automatisk.
  const result = (() => {
    if (kind === 'kode') return codeProblem(studentText, solution, areas.includes('koder-vilkar') ? 'koder-vilkar' : 'koder-lokker', level, found)
    if (kind === 'gjentakende') return repeatingProblem(studentText, solution, level, found)
    if (kind === 'figurtall') return figureProblem(studentText, solution, found)
    return sequenceProblem(studentText, solution, found)
  })()
  if (result || assessment || OPEN_TASK.test(studentText)) delete found.expected
  return result
}

// ---------------------------------------------------------------------------------------------
// Visning: prikkene i figurtall og inputbokser i tallrekker. AI-en tegner ikke selv – den skriver antallene i en fast
// tekstlinje («Figur 1: 5 prikker. Figur 2: 8 prikker. Figur 3: 11 prikker.»), og serveren gir appen tallene.

/** Figurtall med prikker der figurene skal tegnes: minst to figurer med antall, og ikke en oppgave der eleven lager selv. */
const showsDots = (studentText: string) =>
  /prikk/i.test(studentText) && !OPEN_TASK.test(studentText) && kindOf(studentText, '') === 'figurtall' && (dotCountsIn(studentText)?.length ?? 2) >= 2

/** Prikkantallene appen tegner for oppgaven, eller undefined. */
export function dotsFor(studentText: string): number[] | undefined {
  if (!showsDots(studentText)) return undefined
  const counts = dotCountsIn(studentText)
  return counts && dotLayout(counts) ? counts : undefined
}

/** Fargerekka appen tegner som sirkler: én fargerekke på egen linje i et gjentakende mønster, med farger appen kan tegne. */
export function colorsFor(studentText: string): string[] | undefined {
  const rows = colorRowsIn(studentText)
  return kindOf(studentText, '') === 'gjentakende' && rows.length === 1 && drawableColors(rows[0]) ? rows[0] : undefined
}

/**
 * En godkjent tekstoppgave med prikkantall, fargerekke og inputbokser når den har figurtall med prikker, et fargemønster
 * eller en tallrekke med tomme felt.
 */
export function withPatternDisplay(task: AiTextDraft): AiTextDraft {
  const dotCounts = dotsFor(task.studentText)
  const colorItems = dotCounts ? undefined : colorsFor(task.studentText)
  const boxes = !!blankRowIn(task.studentText) && kindOf(task.studentText, task.solution) !== 'kode'
  return { ...task, ...(dotCounts && { dotCounts }), ...(colorItems && { colorItems }), ...(boxes && { answerBoxes: true as const }) }
}
