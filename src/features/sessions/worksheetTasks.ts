import type { Level, Operator, SessionTask, Task, TaskFigure, TextTask } from '../../types/index.ts'
import { strategyInstruction } from '../topics/multiplicationStrategies.ts'

// Oppgaver fra arbeidsark på planetpsyd.no, lagt først i øktene de passer til i årsplanen
// (se topics/curriculum.ts). I Tall følger nivåene tallområdene: nivå 1 er tall 1–20, nivå 2
// tall 1–100 og nivå 3 tall 1–1000. Regnestykkene er skrevet av ordrett fra arkene; fasiten
// regnes ut her, så den alltid stemmer.
// Ark med ukjent tall og tre ledd blir tekstoppgaver (eleven skriver svaret, læreren ser på det),
// vanlige regnestykker blir oppgaver appen retter selv.

/** Arkene, slik de står. «___» og «♡» er tallet eleven skal finne. */
const sheets = {
  /** «Hjerteaddisjon opptil 20» */
  hearts: [
    '9 + ♡ = 13', '♡ + 6 = 13', '1 + 6 = ♡', '4 + ♡ = 11', '3 + 2 = ♡', '♡ + 9 = 13', '8 + ♡ = 17', '♡ + 5 = 9',
    '10 + 3 = ♡', '10 + ♡ = 12', '♡ + 10 = 17', '3 + ♡ = 9', '1 + 3 = ♡', '3 + ♡ = 11', '6 + ♡ = 15', '9 + 7 = ♡',
  ],
  /** «Legg sammen tallene. Kan du finne tiervenner?» */
  tenFriends: [
    '1 + 9 + 9', '7 + 3 + 2', '5 + 5 + 9', '5 + 5 + 2', '1 + 3 + 7', '9 + 7 + 3', '9 + 1 + 7', '8 + 2 + 2',
    '5 + 5 + 8', '1 + 7 + 3', '8 + 6 + 4', '8 + 2 + 4', '5 + 5 + 3', '6 + 4 + 2',
  ],
  /** «Matteoppgaver med 1 ukjent» (opptil 100) */
  oneUnknown: [
    '59 = ___ − 46', '37 + ___ = 71', '12 = ___ + 12', '91 − ___ = 46', '92 = ___ + 10', '65 − ___ = 26',
    '90 = ___ + 21', '77 + ___ = 99', '18 = ___ − 12', '41 + ___ = 94', '30 = ___ + 18', '96 − ___ = 63',
    '85 = ___ − 82', '___ + 70 = 110', '62 = 87 − ___', '___ + 60 = 83', '91 = 55 + ___', '___ − 14 = 20',
    '78 = 143 − ___', '___ + 88 = 111', '56 = 111 − ___', '___ − 28 = 24', '67 = 57 + ___', '___ + 42 = 136',
  ],
  /** «Matematikk 3. trinn», del 2: sett inn riktig tall */
  fillInTwoDigit: [
    '56 + ___ = 99', '15 + ___ = 80', '82 + ___ = 99', '14 + ___ = 72', '___ + 56 = 82', '___ + 23 = 79',
    '___ + 47 = 75', '___ + 43 = 78',
  ],
  /** Samme ark, del 4: sett inn riktig tall (tresifret) */
  fillInThreeDigit: ['256 + ___ = 485', '415 + ___ = 704', '___ + 156 = 318', '___ + 223 = 503'],
  /** Samme ark, del 1 og 3: legg sammen */
  sums: [
    [33, 45], [72, 74], [49, 12], [69, 27],
  ] as [number, number][],
  sumsThreeDigit: [
    [543, 215], [439, 512], [369, 546], [138, 854],
  ] as [number, number][],
  /** «Oppstilt addisjon og subtraksjon» med fire og fem sifre */
  columnFour: [
    [9782, '-', 9256], [6840, '-', 1146], [3917, '+', 7523], [2797, '+', 2168],
    [6565, '-', 1293], [3628, '-', 2671], [5335, '+', 9129], [8829, '+', 5411],
  ] as [number, '+' | '-', number][],
  columnFive: [
    [86777, '-', 31724], [81730, '-', 68016], [36551, '+', 59291], [22581, '+', 2959],
    [28578, '-', 8878], [57795, '-', 28199], [58890, '+', 22875], [75424, '+', 89978],
  ] as [number, '+' | '-', number][],
}

/** Løser et regnestykke med pluss og minus og ett ukjent tall. Returnerer svaret. */
export function solve(expression: string): number {
  const [left, right] = expression.split('=').map((s) => s.trim())
  // Siden med regnetegn er uttrykket, den andre er ett tall (eller det ukjente).
  const hasOperator = (side: string) => /[+−-]/.test(side.replace(/^−/, ''))
  const [expr, result] = hasOperator(left) ? [left, right] : [right, left]
  const isUnknown = (token: string) => token === '___' || token === '♡'

  const tokens = expr.split(/\s+/)
  let constant = 0
  let unknownSign = 0
  for (let i = 0; i < tokens.length; i += 2) {
    const sign = i === 0 || tokens[i - 1] === '+' ? 1 : -1
    if (isUnknown(tokens[i])) unknownSign = sign
    else constant += sign * Number(tokens[i])
  }

  if (result === undefined || isUnknown(result)) return constant
  // constant + unknownSign · x = result
  return (Number(result) - constant) / unknownSign
}

const filled = (expression: string, answer: number) => expression.replace(/___|♡/, String(answer))

function textTask(id: string, level: Level, text: string, solution: string, figure?: TaskFigure): TextTask {
  return {
    kind: 'text',
    id,
    level,
    text,
    solution,
    competenceGoal: '',
    adaptation: '',
    aiGenerated: false,
    reviewed: false,
    source: 'worksheet',
    ...(figure && { figure }),
  }
}

const missing = (id: string, level: Level, expression: string, intro = 'Hvilket tall mangler?') => {
  const answer = solve(expression)
  return textTask(id, level, `${intro}\n${expression}`, `${answer}  (${filled(expression, answer)})`)
}

const heart = (id: string, expression: string) =>
  missing(id, 1, expression, 'Hvilket tall skjuler seg under hjertet?')

const tenFriends = (id: string, expression: string) =>
  textTask(id, 1, `Legg sammen tallene. Kan du finne tiervenner?\n${expression} = ___`, `${solve(expression)}  (${expression} = ${solve(expression)})`)

const math = (
  id: string,
  level: Level,
  a: number,
  operator: Operator,
  b: number,
  type: Task['type'] = 'Hoderegning',
  instruction = type === 'Oppstilling' ? (operator === '-' ? 'Still opp og regn ut. Husk å veksle.' : 'Still opp og regn ut.') : 'Regn ut.',
): Task => ({ id, level, type, instruction, a, operator, b, source: 'worksheet' })

/** `count` oppgaver fra lista, del nummer `part` (0, 1, 2 …). */
function slice<T>(list: T[], part: number, count: number) {
  return list.slice(part * count, part * count + count)
}

const sessionIds = ['okt-5', 'okt-6', 'okt-7', 'okt-8']

/** Flere ark til Tall, sortert etter tallområde. */
const numberSheets = {
  /** «Enigjen 1–10» – regnestykkene på de blå kortene (spillet spilles på papir). */
  cards: [
    [7, '-', 1], [8, '-', 2], [1, '+', 5], [3, '+', 3], [8, '-', 1], [9, '-', 2], [3, '+', 4], [6, '+', 1],
    [9, '-', 1], [7, '+', 1], [3, '+', 5], [4, '+', 4], [10, '-', 1], [2, '+', 7], [3, '+', 6], [5, '+', 4],
  ] as [number, '+' | '-', number][],
  /** «Subtraksjon opptil 100 med tierovergang», del 1 */
  subtraction: [
    [90, 26], [56, 47], [88, 36], [98, 54], [74, 23], [70, 54], [73, 54], [97, 62], [92, 46], [67, 48],
    [74, 65], [61, 43], [92, 72], [70, 43], [56, 52], [92, 11], [100, 89], [73, 12], [63, 14], [50, 26],
  ] as [number, number][],
  /** Samme ark, del 2: sett inn riktig tall */
  subtractionFill: [
    '73 − ___ = 60', '67 − ___ = 55', '___ − 52 = 20', '___ − 7 = 53', '66 − ___ = 4', '56 − ___ = 9', '___ − 53 = 41',
    '___ − 54 = 13', '55 − ___ = 22', '96 − ___ = 20', '___ − 47 = 26', '___ − 12 = 80', '62 − ___ = 22', '64 − ___ = 23',
  ],
  /** «Subtrakt tallene» (3. trinn), del 1 og 2 */
  subtractTwoDigit: [[83, 45], [72, 31], [41, 12], [65, 27], [72, 38], [69, 56], [48, 41], [55, 28], [57, 28], [85, 63], [65, 17], [98, 59]] as [number, number][],
  subtractFillTwoDigit: ['56 − ___ = 29', '95 − ___ = 80', '82 + ___ = 99', '14 + ___ = 72', '___ + 56 = 82', '___ + 23 = 79', '___ − 47 = 29', '___ + 43 = 78', '57 + ___ = 95', '___ − 12 = 31', '40 + ___ = 67', '___ − 32 = 21'],
  /** Samme ark, del 3 og 4 (tresifret) */
  subtractThreeDigit: [[543, 215], [322, 274], [639, 512], [529, 452], [452, 318], [569, 246], [838, 354], [831, 542], [737, 443], [525, 373], [725, 617], [519, 347]] as [number, number][],
  subtractFillThreeDigit: ['256 + ___ = 485', '415 + ___ = 704', '265 + ___ = 558', '264 − ___ = 103', '___ − 156 = 318', '___ + 223 = 503', '___ − 347 = 538', '___ + 143 = 613', '357 + ___ = 408', '___ − 512 = 833', '401 + ___ = 579', '___ − 232 = 618'],
  /** «Summer tallene» (3. trinn), del 3 og 4 (tresifret) */
  sumThreeDigit: [[543, 215], [322, 274], [439, 512], [29, 452], [452, 318], [369, 546], [138, 854], [431, 542], [237, 443], [525, 373], [325, 617], [519, 347]] as [number, number][],
  sumFillThreeDigit: ['256 + ___ = 485', '415 + ___ = 704', '265 + ___ = 558', '264 + ___ = 403', '___ + 156 = 318', '___ + 223 = 503', '___ + 347 = 538', '___ + 143 = 613', '357 + ___ = 408', '___ + 512 = 833', '401 + ___ = 579', '___ + 232 = 618'],
  /** «Mattekryss» (pluss og minus) – radene med bare én tom rute. */
  crossRows: [
    '62 + 35 − 85 = ___', '7 + 2 − ___ = 4', '17 + 13 − 12 = ___', '47 + 18 − 30 = ___', '___ + 3 − 13 = 13', '53 + ___ − 47 = 23',
    '71 + ___ − 69 = 16', '___ + 18 − 40 = 60', '___ + 72 − 17 = 88', '___ + 4 − 52 = 28', '128 + 14 − 50 = ___', '94 + ___ − 62 = 45',
    '215 + 67 − ___ = 88', '138 + 127 − ___ = 146', '___ + 27 − 62 = 58', '31 + 99 − ___ = 85', '162 + ___ − 142 = 164', '___ + 103 − 122 = 199',
  ],
}

/** «Fyll inn tallene på tallinjene»: start, steg, antall merker og hvilke tall som står på arket. */
const numberLines: [number, number, number, number[]][] = [
  [10, 10, 10, [0, 4, 8]],
  [11, 1, 20, [0, 5, 9, 15]],
  [21, 1, 20, [0, 6, 12]],
  [43, 1, 20, [1, 4, 14]],
  [58, 1, 20, [8]],
]

function numberLineTask(id: string, level: Level, [start, step, count, shown]: (typeof numberLines)[number]) {
  const values = Array.from({ length: count }, (_, i) => start + i * step)
  const line = values.map((v, i) => (shown.includes(i) ? String(v) : '___')).join(', ')
  const missingValues = values.filter((_, i) => !shown.includes(i))
  return textTask(id, level, `Fyll inn tallene som mangler på tallinjen.\n${line}`, missingValues.join(', '))
}

/** «Hva blir de neste tallene?» (tallrekker) – uten eksempelet 0, 2, 0, 2. */
const numberSequences: { start: number[]; rule: string; next: (seq: number[]) => number }[] = [
  { start: [100, 110, 120, 130], rule: '10 mer hver gang', next: (q) => q[q.length - 1] + 10 },
  { start: [60, 65, 70, 75], rule: '5 mer hver gang', next: (q) => q[q.length - 1] + 5 },
  { start: [40, 42, 44, 46], rule: '2 mer hver gang', next: (q) => q[q.length - 1] + 2 },
  { start: [9, 13, 17, 21], rule: '4 mer hver gang', next: (q) => q[q.length - 1] + 4 },
  { start: [67, 74, 81, 88], rule: '7 mer hver gang', next: (q) => q[q.length - 1] + 7 },
  { start: [4, 5, 7, 10], rule: 'økningen blir 1 større hver gang', next: (q) => q[q.length - 1] + (q[q.length - 1] - q[q.length - 2] + 1) },
  { start: [6, 6, 12, 18], rule: 'hvert tall er summen av de to før', next: (q) => q[q.length - 1] + q[q.length - 2] },
  { start: [4, 8, 16, 32], rule: 'tallet dobles hver gang', next: (q) => q[q.length - 1] * 2 },
  { start: [3, 9, 27, 81], rule: 'tallet ganges med 3 hver gang', next: (q) => q[q.length - 1] * 3 },
]

export function continueSequence(start: number[], next: (seq: number[]) => number, count = 4) {
  const seq = [...start]
  for (let i = 0; i < count; i++) seq.push(next(seq))
  return seq.slice(start.length)
}

function sequenceTask(id: string, level: Level, { start, rule, next }: (typeof numberSequences)[number]) {
  return textTask(
    id,
    level,
    `Hva blir de fire neste tallene?\n${start.join(', ')}, ___, ___, ___, ___`,
    `${continueSequence(start, next).join(', ')}  (${rule})`,
  )
}

/** Tall, økt 11–14 (okt-5 til okt-8): seks oppgaver per nivå i hver økt. */
function additionTasks(part: number): SessionTask[] {
  const id = (sheet: string, i: number) => `ark-${sessionIds[part]}-${sheet}-${i + 1}`
  const n = numberSheets
  return [
    // Nivå 1 – tall 1–20: hjerteaddisjon, tiervenner og kortene fra Enigjen
    ...slice(sheets.hearts, part, 2).map((e, i) => heart(id('hjerte', i), e)),
    ...slice(sheets.tenFriends, part, 2).map((e, i) => tenFriends(id('tiervenner', i), e)),
    ...slice(n.cards, part, 2).map(([a, op, b], i) => math(id('enigjen', i), 1, a, op, b, 'Hoderegning', 'Regn ut kortet fra Enigjen.')),
    // Nivå 2 – tall 1–100: ett ukjent tall og subtraksjon med tierovergang
    ...slice(sheets.oneUnknown, part, 2).map((e, i) => missing(id('ukjent', i), 2, e)),
    ...slice(n.subtraction, part, 2).map(([a, b], i) => math(id('subtraksjon', i), 2, a, '-', b)),
    ...slice(n.subtractionFill, part, 2).map((e, i) => missing(id('sett-inn', i), 2, e, 'Sett inn riktig tall.')),
    // Nivå 3 – tall 1–1000: tresifret addisjon og subtraksjon, og sett inn riktig tall
    ...slice(n.sumThreeDigit, part, 1).map(([a, b], i) => math(id('sum-3', i), 3, a, '+', b)),
    ...slice(n.subtractThreeDigit, part, 2).map(([a, b], i) => math(id('subtraksjon-3', i), 3, a, '-', b)),
    ...slice(n.sumFillThreeDigit, part, 1).map((e, i) => missing(id('sett-inn-3', i), 3, e, 'Sett inn riktig tall.')),
    ...slice(n.subtractFillThreeDigit, part, 2).map((e, i) => missing(id('sett-inn-minus-3', i), 3, e, 'Sett inn riktig tall.')),
  ]
}

/** «Oppstilling med tall over 1000» (okt-7): fire sifre på nivå 2 og fem sifre på nivå 3. */
const columnTasks = (sessionId: string): SessionTask[] => [
  ...sheets.columnFour.slice(0, 6).map(([a, op, b], i) => math(`ark-${sessionId}-oppstilt-4-${i + 1}`, 2, a, op, b, 'Oppstilling')),
  ...sheets.columnFive.slice(0, 6).map(([a, op, b], i) => math(`ark-${sessionId}-oppstilt-5-${i + 1}`, 3, a, op, b, 'Oppstilling')),
]

/** Repetisjon høst: tallforståelse (mattekryss) og addisjon/subtraksjon (resten av arkene). */
function numberReviewTasks(sessionId: string, kind: 'tallforstaelse' | 'addisjon-subtraksjon'): SessionTask[] {
  const id = (sheet: string, i: number) => `ark-${sessionId}-${sheet}-${i + 1}`
  const n = numberSheets
  if (kind === 'tallforstaelse') {
    return [
      ...n.crossRows.slice(0, 6).map((e, i) => missing(id('mattekryss', i), 2, e, 'Mattekryss: finn tallet i den tomme ruta.')),
      ...n.crossRows.slice(12, 18).map((e, i) => missing(id('mattekryss', i + 12), 3, e, 'Mattekryss: finn tallet i den tomme ruta.')),
    ]
  }
  return [
    ...sheets.tenFriends.slice(8, 14).map((e, i) => tenFriends(id('tiervenner', i), e)),
    ...n.subtractTwoDigit.slice(0, 3).map(([a, b], i) => math(id('subtraksjon', i), 2, a, '-', b)),
    ...n.subtractFillTwoDigit.slice(0, 3).map((e, i) => missing(id('sett-inn', i), 2, e, 'Sett inn riktig tall.')),
    ...n.subtractThreeDigit.slice(8, 11).map(([a, b], i) => math(id('subtraksjon-3', i), 3, a, '-', b)),
    ...n.subtractFillThreeDigit.slice(8, 11).map((e, i) => missing(id('sett-inn-3', i), 3, e, 'Sett inn riktig tall.')),
  ]
}

/** Tallrekker (Mønster og algoritmer, «Mønster i tallfølger»): tallinjene på nivå 1, tallrekkene på nivå 2 og 3. */
const sequenceSessionTasks = (sessionId: string): SessionTask[] => [
  ...numberLines.map((line, i) => numberLineTask(`ark-${sessionId}-tallinje-${i + 1}`, 1, line)),
  ...numberSequences.map((seq, i) => sequenceTask(`ark-${sessionId}-tallrekke-${i + 1}`, i < 5 ? 2 : 3, seq)),
]

// ---------------------------------------------------------------------------------------
// Regnerekkefølge (Repetisjon høst: «Problemløsing med flere regnearter» og «Dette mestrer jeg»)

/** «Regnerekkefølger», del 1–3. Arkets * er skrevet som ·. */
const orderOfOperations = {
  two: [
    '32 : 4 + 70', '29 + 6 : 1', '9 · 3 + 93', '45 − 8 : 2', '2 : 2 − 1', '51 + 9 · 8', '9 · 1 − 6', '91 − 5 : 5',
    '88 + 27 : 9', '15 : 3 + 99', '59 − 50 : 5', '10 · 1 + 22', '57 + 7 · 6', '48 : 6 − 5', '56 − 80 : 10', '9 · 10 − 13',
  ],
  three: ['36 : 6 + 8 · 2', '4 · 8 + 27 − 33', '16 : 2 + 4 · 8', '6 · 4 + 44 − 37'],
  five: ['88 + 56 : 8 − 79 + 12 · 8', '54 − 48 : 6 + 45 + 27 · 8', '58 + 49 : 7 − 19 + 9 · 10', '75 − 5 : 5 + 33 + 64 · 8'],
}

/** Regner ut med regnerekkefølge: først · og :, så + og − fra venstre. */
export function evaluate(expression: string): number {
  const tokens = expression.split(/\s+/)
  // Første runde: slå sammen gange og dele til ett tall.
  const terms: (number | string)[] = [Number(tokens[0])]
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]
    const value = Number(tokens[i + 1])
    if (op === '·' || op === ':') {
      const previous = terms.pop() as number
      terms.push(op === '·' ? previous * value : previous / value)
    } else terms.push(op, value)
  }
  // Andre runde: pluss og minus fra venstre.
  let result = terms[0] as number
  for (let i = 1; i < terms.length; i += 2) result = terms[i] === '+' ? result + (terms[i + 1] as number) : result - (terms[i + 1] as number)
  return result
}

function orderTasks(sessionId: string, part: number): SessionTask[] {
  const task = (level: Level, kind: string, i: number, expression: string) =>
    textTask(
      `ark-${sessionId}-rekkefolge-${kind}-${i + 1}`,
      level,
      `Regn ut. Husk regnerekkefølgen: gange og dele før pluss og minus.\n${expression} = ___`,
      `${evaluate(expression)}  (${expression} = ${evaluate(expression)})`,
    )
  return [
    ...slice(orderOfOperations.two, part * 2, 4).map((e, i) => task(1, 'to', i, e)),
    ...slice(orderOfOperations.two, part * 2 + 1, 4).map((e, i) => task(2, 'to-b', i, e)),
    ...slice(orderOfOperations.three, part, 2).map((e, i) => task(3, 'tre', i, e)),
    ...slice(orderOfOperations.five, part, 2).map((e, i) => task(3, 'fem', i, e)),
  ]
}

// ---------------------------------------------------------------------------------------
// Deling (Divisjon, se sharingSessions) og flersifret divisjon (Strategier i divisjon økt 1)

/** «Oppgaver med deling – enkelt nivå» (del 1 og 3). Del 2 og 4 bygger på bilder og er ikke med. */
const simpleDivision: [number, number][] = [
  [2, 1], [2, 2], [3, 3], [3, 1], [4, 1], [4, 2], [4, 4], [5, 1], [5, 5], [6, 1], [6, 2], [6, 3],
  [8, 1], [8, 2], [8, 4], [10, 2], [10, 5], [9, 3], [12, 3], [12, 4], [9, 1], [16, 4], [15, 3], [15, 5],
  [20, 4], [20, 5], [25, 5], [30, 5], [30, 6], [24, 4], [24, 6], [18, 3], [18, 6], [12, 3], [20, 5], [18, 2],
]

/** «Gangetabell 1–100», kolonne for kolonne. */
const timesTableDrill: [number, Operator, number][] = [
  [5, '*', 4], [48, '/', 6], [7, '*', 2], [5, '*', 5], [50, '/', 10], [9, '*', 2], [1, '*', 6], [10, '/', 10], [1, '*', 1],
  [4, '*', 8], [4, '/', 4], [8, '*', 9], [2, '*', 3], [9, '/', 3], [10, '*', 9], [4, '*', 5], [36, '/', 6], [3, '*', 1],
  [6, '*', 6], [18, '/', 6], [3, '*', 2], [9, '*', 3], [45, '/', 9], [8, '*', 4], [9, '*', 5], [30, '/', 6], [8, '*', 2],
  [4, '*', 6], [63, '/', 9], [3, '*', 6], [8, '*', 7], [48, '/', 8], [7, '*', 6], [8, '*', 3], [40, '/', 8], [3, '*', 4],
  [5, '*', 4], [18, '/', 6], [1, '*', 6], [4, '*', 8], [45, '/', 9], [4, '*', 4],
]

const boltIntro = 'Thomas hjelper pappa med å skifte bildekk. Hvert hjul har 6 bolter.'

/** Leseoppgaver om bolter i bilen (skrivefeil på arket er rettet). */
const boltTasks: { level: Level; text: string; solution: string }[] = [
  {
    level: 2,
    text: 'Thomas hjelper pappa med å skifte bildekk. Bilen har 4 hjul, og det skal skiftes 4 dekk. Hvert hjul har 6 bolter. Hvor mange bolter må Thomas skru av for å ta av alle hjulene?',
    solution: `${4 * 6}  (4 · 6 = ${4 * 6})`,
  },
  {
    level: 2,
    text: `${boltIntro} Hver bolt har 6 hjørner. Hvor mange hjørner er det til sammen i alle boltene på ett dekk?`,
    solution: `${6 * 6}  (6 · 6 = ${6 * 6})`,
  },
  {
    level: 2,
    text: `${boltIntro} Hvor mange bolter trenger Thomas for å skifte dekk på en lastebil med 8 hjul?`,
    solution: `${8 * 6}  (8 · 6 = ${8 * 6})`,
  },
  {
    level: 3,
    text: `${boltIntro} Thomas har skrudd og skrudd uten å telle hjulene. Hvor mange hjul har han tatt av hvis det ligger 42 bolter ved siden av ham?`,
    solution: `${42 / 6}  (42 : 6 = ${42 / 6})`,
  },
  {
    level: 3,
    text: `${boltIntro} Hvor mange hjul har bilen hvis Thomas har 54 bolter når han er ferdig?`,
    solution: `${54 / 6}  (54 : 6 = ${54 / 6})`,
  },
]

/** «Divisjon – regn ut trinn for trinn» (flersifret). */
const longDivision: [number, number][] = [[13668, 2], [32532, 6], [9032, 4], [47223, 9], [8865, 9], [12672, 6]]

/**
 * Delestykkene fra «Oppgaver med deling» på nivå 1. Gangetabellarket (gange og dele om hverandre)
 * bare der økta handler om sammenhengen mellom gange og dele – ikke i øktene om delingsdivisjon og målingsdivisjon.
 */
function sharingTasks(sessionId: string, part: number, withTimesTable: boolean): SessionTask[] {
  const id = (sheet: string, i: number) => `ark-${sessionId}-${sheet}-${i + 1}`
  return [
    ...slice(simpleDivision, part, 6).map(([a, b], i) => math(id('deling', i), 1, a, '/', b)),
    ...(withTimesTable ? slice(timesTableDrill, part, 6).map(([a, op, b], i) => math(id('gangetabell', i), 2, a, op, b)) : []),
  ]
}

const divisionTasks = (sessionId: string): SessionTask[] =>
  longDivision.map(([a, b], i) =>
    math(`ark-${sessionId}-divisjon-${i + 1}`, 3, a, '/', b, 'Hoderegning', 'Regn ut trinn for trinn. Bruk gjerne kladdeark.'),
  )

// ---------------------------------------------------------------------------------------
// Areal (Måling økt 4 «Måle areal»). Figurene er tegnet av fra arket.

/** «Finn arealet av figurene» A–I. «#» er en rute på 1 cm². */
const areaFigures: Record<string, string[]> = {
  A: ['####', '####'],
  B: ['###', '###', '###', '###', '###'],
  C: ['######', '######', '######', '######'],
  D: ['######', '######', '######', '######', '######', '######', '######', '######'],
  E: ['#######', '#######', '##.....', '##.....'],
  F: ['##.....', '##.##..', '#######'],
  G: ['######', '#......', '######'],
  H: ['#####', '#.#.#', '#.#.#'],
  I: ['..#####', '..#....', '#####..', '..#....', '..#####'],
}

const areaLevels: Record<Level, string[]> = { 1: ['A', 'B', 'C'], 2: ['D', 'E', 'G'], 3: ['F', 'H', 'I'] }

function areaTasks(sessionId: string): SessionTask[] {
  return ([1, 2, 3] as const).flatMap((level) =>
    areaLevels[level].map((name) => {
      const rows = areaFigures[name]
      const area = rows.join('').split('').filter((c) => c === '#').length
      const isRectangle = rows.every((r) => r === rows[0] && !r.includes('.'))
      const how = isRectangle ? `${rows.length} rader med ${rows[0].length} ruter: ${rows.length} · ${rows[0].length} = ${area}` : `tell rutene`
      return textTask(
        `ark-${sessionId}-areal-${name}`,
        level,
        `Finn arealet av figur ${name}. Hver rute er 1 cm².`,
        `${area} cm²  (${how})`,
        { kind: 'grid', rows },
      )
    }),
  )
}

// ---------------------------------------------------------------------------------------
// Klokka (Måling økt 6 «Tid» og Repetisjon vår). Arkene ber eleven tegne visere – i appen er det snudd:
// appen tegner klokka, og eleven skriver hva den viser.

const minutesOfDay = (time: string) => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}
const clockTime = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
const duration = (minutes: number) => `${Math.floor(minutes / 60)} t ${String(minutes % 60).padStart(2, '0')} min`
const durationWords = (minutes: number) => {
  const h = Math.floor(Math.abs(minutes) / 60)
  const m = Math.abs(minutes) % 60
  const parts = [h > 0 && `${h} ${h === 1 ? 'time' : 'timer'}`, m > 0 && `${m} minutter`].filter(Boolean)
  return parts.join(' og ')
}

/** Samme tid på en analog klokke kan bety formiddag eller kveld: «6:55 eller 18:55». */
function bothReadings(time: string) {
  const [h, m] = time.split(':').map(Number)
  const mm = String(m).padStart(2, '0')
  const morning = h % 12 === 0 ? 12 : h % 12
  const evening = h % 12 === 0 ? '00' : String(h % 12 + 12)
  return `${morning}:${mm} eller ${evening}:${mm}`
}

/** «Tegn visere på klokkene: hel, halv, kvart» – med ordene fra arket. */
const halfQuarter: [string, string][] = [
  ['10:45', 'kvart på elleve'], ['03:00', 'tre'], ['07:30', 'halv åtte'], ['03:30', 'halv fire'],
  ['11:45', 'kvart på tolv'], ['09:30', 'halv ti'], ['05:45', 'kvart på seks'], ['08:00', 'åtte'],
]

/** «Tegn visere på klokkene» (eksakt klokkeslett). 16:38:46 er ikke med, siden klokka ikke har sekundviser. */
const exactTimes = [
  '11:09', '18:55', '12:21', '21:10', '01:21', '06:38', '12:59', '17:34',
  '06:23', '08:29', '11:54', '15:52', '22:59', '22:52', '22:46',
]

/** «Fortsett mønsteret – hel, halv og kvart fram og tilbake i tid» */
const timePatterns = [
  ['12:00', '13:00', '14:00'], ['12:00', '12:15', '12:30'], ['12:00', '11:15', '10:30'], ['13:00', '11:15', '09:30'],
]

/** «Hva blir klokka?» – uten eksemplene og uten 06:60 og 13:60, som ikke er gyldige klokkeslett. */
const timeLater: [string, number][] = [
  ['15:15', 35], ['05:35', 50], ['10:50', 45], ['18:00', 55], ['12:55', 40], ['15:10', 20], ['16:50', 35], ['00:15', 35], ['13:55', 35],
]
const timeEarlier: [string, number][] = [
  ['05:35', 15], ['12:00', 20], ['10:35', 25], ['02:45', 35], ['03:45', 40], ['13:00', 55], ['06:55', 25], ['16:20', 60], ['10:13', 30],
]

/** «Hvor lenge er det mellom klokkeslettene?» – uten eksempelet og uten 17:60 og 09:60. */
const timeBetween: [string, string][] = [
  ['02:35', '07:30'], ['00:00', '10:40'], ['11:55', '21:50'], ['20:25', '21:05'], ['15:55', '23:40'], ['01:25', '09:55'], ['18:30', '22:20'],
  ['06:25', '08:50'], ['15:05', '20:05'], ['11:50', '15:20'], ['02:05', '11:40'], ['00:45', '07:35'], ['11:35', '16:40'],
]

/** «Tegn visere og skriv klokkeslett» – starttid lest av klokkene på arket, og tiden som legges til/trekkes fra. Eksemplene er ikke med. */
const clockSums: [string, number][] = [
  ['09:00', 150], ['06:45', 75], ['10:35', 180], ['07:10', -70], ['15:00', -165], ['12:15', -90],
]

function clockTasks(sessionId: string, part: number): SessionTask[] {
  const id = (sheet: string, i: number) => `ark-${sessionId}-${sheet}-${i + 1}`

  const readWords = (time: string, words: string, level: Level, i: number) =>
    textTask(id('hel-halv-kvart', i), level, 'Hva er klokka? Skriv med ord, for eksempel «halv tre».', `klokka ${words}  (${bothReadings(time)})`, { kind: 'clock', time })

  const readDigital = (time: string, level: Level, i: number) =>
    textTask(id('les-klokka', i), level, 'Hva er klokka? Skriv klokkeslettet digitalt, for eksempel 14:25.', bothReadings(time), { kind: 'clock', time })

  const pattern = ([a, b, c]: string[], i: number) => {
    const step = minutesOfDay(b) - minutesOfDay(a)
    const next = [minutesOfDay(c) + step, minutesOfDay(c) + 2 * step].map(clockTime)
    return textTask(
      id('monster', i),
      3,
      `Fortsett mønsteret. Hvilke to klokkeslett kommer etterpå?\n${a} → ${b} → ${c} → ___ → ___`,
      `${next[0]} og ${next[1]}  (${durationWords(step)} ${step > 0 ? 'fram' : 'tilbake'} hver gang)`,
    )
  }

  const later = ([start, add]: [string, number], level: Level, i: number) =>
    textTask(id('senere', i), level, `Hva blir klokka?\n${start} + ${add} min = ___`, clockTime(minutesOfDay(start) + add))

  const earlier = ([start, sub]: [string, number], level: Level, i: number) =>
    textTask(id('tidligere', i), level, `Hva blir klokka?\n${start} − ${sub} min = ___`, clockTime(minutesOfDay(start) - sub))

  const between = ([from, to]: [string, string], level: Level, i: number) =>
    textTask(id('mellom', i), level, `Hvor lang tid er det fra ${from} til ${to}?`, duration(minutesOfDay(to) - minutesOfDay(from)))

  const clockSum = ([start, change]: [string, number], level: Level, i: number) =>
    textTask(
      id('regn-med-klokka', i),
      level,
      `Klokka viser når vi starter. Hva er klokka ${durationWords(change)} ${change > 0 ? 'senere' : 'tidligere'}?`,
      `${clockTime(minutesOfDay(start) + change)}  (${start} ${change > 0 ? '+' : '−'} ${duration(Math.abs(change))})`,
      { kind: 'clock', time: start },
    )

  switch (part) {
    case 0: // «Hel, halv og kvart»
      return [
        ...halfQuarter.slice(0, 4).map(([t, w], i) => readWords(t, w, 1, i)),
        ...halfQuarter.slice(4).map(([t, w], i) => readWords(t, w, 2, i + 4)),
        ...timePatterns.map(pattern),
      ]
    case 1: // «Analog og digital klokke»
      return ([1, 2, 3] as const).flatMap((level) => slice(exactTimes, level - 1, 5).map((t, i) => readDigital(t, level, (level - 1) * 5 + i)))
    case 2: // «Hvor lang tid tar det?»
      return ([1, 2, 3] as const).flatMap((level) => [
        ...slice(timeLater, level - 1, 3).map((t, i) => later(t, level, (level - 1) * 3 + i)),
        ...slice(timeEarlier, level - 1, 3).map((t, i) => earlier(t, level, (level - 1) * 3 + i)),
      ])
    default: // «Dette mestrer jeg – klokke og tid»
      return [
        ...clockSums.slice(0, 3).map((c, i) => clockSum(c, 1, i)),
        ...clockSums.slice(3).map((c, i) => clockSum(c, 2, i + 3)),
        ...timeBetween.slice(0, 5).map((b, i) => between(b, 2, i)),
        ...timeBetween.slice(5).map((b, i) => between(b, 3, i + 5)),
      ]
  }
}

// ---------------------------------------------------------------------------------------
// Multiplikasjon (se multiplicationSessions). Gangearkene er skrevet av kolonne for kolonne; like stykker
// på samme ark er bare tatt med én gang.

type Fact = [number, Operator, number]

/** «3·5 6·3 48:8» → regnestykker, uten gjentakelser. */
function facts(sheet: string): Fact[] {
  const seen = new Set<string>()
  return sheet
    .trim()
    .split(/\s+/)
    .filter((f) => !seen.has(f) && seen.add(f))
    .map((f) => {
      const [a, b] = f.split(/[·:]/).map(Number)
      return [a, f.includes(':') ? '/' : '*', b]
    })
}

const timesSheets = {
  zeroOne: facts(`1·1 0·3 0·0 1·8 1·7 0·9 1·7 1·4 0·9 1·6 1·8 0·4 1·0 0·4 1·0
    1·6 0·2 0·9 1·2 0·5 1·8 1·7 0·7 1·0 0·0 0·9 1·1 1·8 1·7 0·6 0·8 1·5 1·3 1·6 0·7 1·1 0·6 0·7 1·9`),
  three: facts(`3·5 6·3 3·4 1·3 3·7 4·3 8·3 3·3 6·3 3·7 10·3 5·3 1·3 3·5 3·0
    3·5 6·3 7·3 3·8 2·3 3·6 3·5 0·3 8·3 3·2 3·7 10·3 3·1 3·3 3·10 3·7 4·3 3·4 2·3 7·3 3·3 1·3 3·6 4·3 3·0 3·2 3·9`),
  four: facts(`4·4 6·4 4·3 2·4 4·9 5·4 6·4 4·10 8·4 4·0 2·4 6·4 10·4 4·6 4·8
    4·5 3·4 2·4 4·6 4·4 4·3 4·5 8·4 7·4 4·8 4·1 2·4 4·0 2·4 4·8 4·8 1·4 4·9 2·4 8·4 4·3 2·4 4·8 10·4 4·3 4·9 10·4 9·4`),
  five: facts(`5·10 6·5 5·7 6·5 5·2 2·5 7·5 5·3 2·5 5·5 2·5 2·5 8·5 5·5 5·0
    5·4 1·5 4·5 5·7 6·5 5·5 5·6 1·5 0·5 5·1 5·10 6·5 5·3 10·5 5·10 5·4 5·5 5·6 8·5 3·5 5·3 5·5 5·9 5·10 5·8`),
  six: facts(`6·4 8·6 6·1 7·6 6·4 10·6 8·6 6·1 10·6 6·7 8·6 10·6 0·6 6·2 6·5
    6·10 7·6 6·6 6·1 4·6 6·2 6·8 1·6 6·6 6·5 6·10 2·6 6·9 10·6 6·0 6·2 7·6 6·9 2·6 3·6 6·10 6·7 9·6`),
  seven: facts(`7·4 8·7 7·3 8·7 7·8 1·7 7·7 7·3 8·7 7·6 2·7 1·7 9·7 7·9 7·4`),
  eight: facts(`8·8 2·8 8·0 1·8 8·3 5·8 6·8 8·5 2·8 8·0 6·8 10·8 0·8 8·5 8·5`),
  nine: facts(`9·5 10·9 9·3 6·9 9·10 5·9 2·9 9·10 8·9 9·9 10·9 5·9 2·9 9·9 9·1`),
  ten: facts(`10·8 0·10 10·10 9·10 10·10 7·10 8·10 10·7 8·10 10·5 5·10 6·10 4·10 10·5 10·9`),
  /** «Gangetabell 8-gange og deling», delekolonnen */
  eightDivision: facts(`72:8 56:8 48:8 40:8 24:8 16:8 80:8 64:8`),
  /** «Gangetabell 10-gange og deling», annenhver fra dele- og gangekolonnen */
  tenMixed: facts(`60:10 9·10 70:10 6·10 80:10 5·10 30:10 7·10 90:10 10·10 10:10 2·10 100:10 1·10 20:10 4·10`),
  /** «Gangetabell 1–100» (det andre arket – v2 ligger i Deling), annenhver gange og dele */
  mixed: facts(`8·5 25:5 3·4 32:8 8·3 20:4 7·8 42:7 81:9`),
  /** «Gangetabell nivå 1», oppgave 4 */
  levelOne: facts(`2·3 4·3 2·7 6·3 5·9 3·2 4·5 5·6 2·6 5·5 7·5 2·4`),
  /** «Fyll ut gangetabellen» (store gangetabell, 1–20) – noen av de tomme rutene */
  bigTable: facts(`12·7 15·4 17·3`),
}

/** «Gangetabell nivå 1», oppgave 3: «Bytt ut regnestykkene med gange» */
const repeatedAddition = ['5+5+5', '6+6', '8+8+8+8', '3+3+3', '4+4+4', '5+5+5+5+5', '3+3+3+3+3+3', '6+6+6+6+6+6+6']

/** «Oppstilt multiplikasjon med 1 og 2 sifre» – uten eksempelet (4 · 13), det største tallet øverst. */
const columnTimes: Fact[] = [[54, '*', 2], [43, '*', 4], [57, '*', 7], [33, '*', 2], [42, '*', 5], [19, '*', 6]]

/** «Regnesirkel»: fra 56 og rundt igjen til 56. Det tomme feltet er steget eleven skal finne. */
const circleSteps: { text: string; apply: (n: number) => number }[] = [
  { text: 'trekk fra 2', apply: (n) => n - 2 },
  { text: 'halvparten', apply: (n) => n / 2 },
  { text: '3 ganger mindre', apply: (n) => n / 3 },
  { text: '???', apply: (n) => n - 2 },
  { text: 'dobbelt så stort', apply: (n) => n * 2 },
  { text: '4 ganger større', apply: (n) => n * 4 },
]

function circleTask(id: string): TextTask {
  const values = circleSteps.reduce((list, step) => [...list, step.apply(list[list.length - 1])], [56])
  const steps = circleSteps.map((s) => (s.text === '???' ? '[mangler]' : s.text)).join(' → ')
  return textTask(
    id,
    3,
    `Regnesirkel: Start på 56 og følg stegene rundt til du er tilbake på 56.\n${steps}\nHvilke tall kommer underveis, og hva er steget som mangler?`,
    `${values.slice(1).join(', ')}. Steget som mangler er «trekk fra 2» (${values[3]} − 2 = ${values[4]}).`,
  )
}

/** Bare gangestykker der minst én av faktorene er i `factors` – arkene blander inn andre tabeller og deling. */
const onlyTables = (list: Fact[], factors: number[]) =>
  list.filter(([a, op, b]) => op === '*' && (factors.includes(a) || factors.includes(b)))

/**
 * Gangearkene til Multiplikasjon, økt for økt. Hver økt får bare gangetabellene i overskriften
 * (se øktprofilene i topics/yearPlan.ts). Ark som ikke passer noen økt, er ikke med.
 */
function multiplicationTasks(sessionId: string, session: number): SessionTask[] {
  const id = (sheet: string, i: number) => `ark-${sessionId}-${sheet}-${i + 1}`
  const drill = (list: Fact[], sheet: string, level: Level, from: number, count: number, instruction = 'Regn ut.') =>
    list.slice(from, from + count).map(([a, op, b], i) => math(id(sheet, from + i), level, a, op, b, 'Hoderegning', instruction))
  /** Strategiøkt: hvert stykke får strategistøtten for nivået (se multiplicationStrategies.ts). */
  const withStrategy = (tasks: SessionTask[]) =>
    tasks.map((t) => (t.kind === 'text' ? t : { ...t, instruction: strategyInstruction(t.level, t.a, t.b) ?? t.instruction }))
  /** Nivå 3 i en strategiøkt: ikke 0, 1 eller 2 som faktor – de gir ingen reell strategiutfordring. */
  const challenging = (list: Fact[]) => list.filter(([a, , b]) => a > 2 && b > 2)

  switch (session) {
    case 1: // «Like grupper og gjentatt addisjon»: figurer og gjentatt addisjon – ingen gangetabell
      return [
        textTask(id('bilde', 0), 1, 'Se på figuren. Lag to regnestykker: ett med pluss og ett med gange.', '4 + 4 = 8 og 2 · 4 = 8  (eller 2 + 2 + 2 + 2 = 8 og 4 · 2 = 8)', { kind: 'grid', rows: ['####', '####'] }),
        textTask(id('bilde', 1), 1, 'Se på figuren. Lag to regnestykker: ett med pluss og ett med gange.', '8 + 8 + 8 = 24 og 3 · 8 = 24  (eller 8 · 3 = 24)', { kind: 'grid', rows: ['########', '########', '########'] }),
        ...repeatedAddition.map((sum, i) => {
          const parts = sum.split('+').map(Number)
          const total = parts.reduce((a, b) => a + b, 0)
          // Få ledd på nivå 1, flere på nivå 2 og 3 (som i øktprofilen).
          const level: Level = parts.length <= 3 ? 1 : parts.length <= 5 ? 2 : 3
          return textTask(id('bytt-til-gange', i), level, `Skriv som gangestykke, og regn ut.\n${sum.replaceAll('+', ' + ')} = ___`, `${parts.length} · ${parts[0]} = ${total}`)
        }),
      ]
    case 2: // «Gangetegnet og 0- og 1-gangen»
      return [
        // Arket har tall opp til 10. Nivå 3 (store tall med 0 og 1) får bare genererte oppgaver.
        ...drill(timesSheets.zeroOne, '0-1-gangen', 1, 0, 6),
        ...drill(timesSheets.zeroOne, '0-1-gangen', 2, 6, 12),
      ]
    case 3: // «2-, 5- og 10-gangen»
      return [
        ...drill(onlyTables(timesSheets.ten, [10]), '10-gangen', 1, 0, 6),
        ...drill(onlyTables(timesSheets.five, [5]), '5-gangen', 2, 0, 6),
        ...drill(onlyTables(timesSheets.levelOne, [2]), '2-gangen', 3, 0, 3),
        ...drill(onlyTables(timesSheets.tenMixed, [10]), '10-gangen-blandet', 3, 0, 3),
      ]
    case 4: // «3- og 4-gangen – doble og halvere»
      return [
        ...drill(onlyTables(timesSheets.three, [3]), '3-gangen', 1, 0, 6),
        ...drill(onlyTables(timesSheets.four, [4]), '4-gangen', 2, 0, 6),
        ...drill(onlyTables(timesSheets.three, [3]), '3-gangen', 3, 6, 3),
        ...drill(onlyTables(timesSheets.four, [4]), '4-gangen', 3, 6, 3),
        circleTask(id('regnesirkel', 0)),
      ]
    case 5: // «6-gangen og sammenhenger i tabellen»
      return [
        ...drill(onlyTables(timesSheets.six, [6]), '6-gangen', 1, 0, 6),
        ...drill(onlyTables(timesSheets.six, [6]), '6-gangen', 2, 6, 6),
        ...drill(onlyTables(timesSheets.six, [6]), '6-gangen', 3, 12, 6),
      ]
    case 6: // «7-, 8- og 9-gangen med smarte strategier»: strategistøtte per stykke og nivå
      return withStrategy([
        ...drill(onlyTables(timesSheets.seven, [7]), '7-gangen', 1, 0, 6),
        ...drill(onlyTables(timesSheets.eight, [8]), '8-gangen', 2, 0, 3),
        ...drill(onlyTables(timesSheets.nine, [9]), '9-gangen', 2, 0, 3),
        ...drill(challenging(onlyTables(timesSheets.seven, [7])), '7-gangen-utfordring', 3, 5, 2),
        ...drill(challenging(onlyTables(timesSheets.eight, [8])), '8-gangen-utfordring', 3, 2, 2),
        ...drill(challenging(onlyTables(timesSheets.nine, [9])), '9-gangen-utfordring', 3, 6, 2),
      ])
    case 8: // «Dele opp og multiplisere»: tosifret · ensifret, stilt opp
      return columnTimes.map(([a, op, b], i) => math(id('oppstilt', i), 3, a, op, b, 'Oppstilling', 'Still opp og regn ut.'))
    case 9: // «Bruke blokkmodeller»: like grupper i hverdagen
      return boltTasks.slice(0, 3).map((t, i) => textTask(id('bolter', i), 2, t.text, t.solution))
    default:
      return []
  }
}

// ---------------------------------------------------------------------------------------
// Tallkryss med gange og deling (Divisjon økt 1: «Multiplikasjon og divisjon henger sammen»)

/** Rader og kolonner fra «Mattekryss» (gange og deling) med bare én tom rute. */
const timesCross = {
  easy: ['2 · ___ = 6', '___ · 3 = 27', '3 · ___ = 3', '3 · 3 = ___', '2 · 5 = ___', '6 : 3 = ___'],
  // «16 · 18 = ___» er tatt ut: et rent gangestykke med tosifrede tall viser ikke sammenhengen med deling.
  hard: ['___ · 6 = 48', '___ · 6 = 90', '14 · ___ = 70', '___ · 7 = 245'],
}

/** Løser «a · b = c» eller «a : b = c» med én tom rute. */
export function solveTimes(expression: string): number {
  const [left, c] = expression.split('=').map((x) => x.trim())
  const [a, op, b] = left.split(/\s+/)
  const blank = (x: string) => x === '___'
  const [na, nb, nc] = [Number(a), Number(b), Number(c)]
  if (op === '·') return blank(c) ? na * nb : blank(a) ? nc / nb : nc / na
  return blank(c) ? na / nb : blank(a) ? nb * nc : na / nc
}

const timesCrossTasks = (sessionId: string): SessionTask[] =>
  (['easy', 'hard'] as const).flatMap((kind) =>
    timesCross[kind].map((expression, i) => {
      const answer = solveTimes(expression)
      return textTask(
        `ark-${sessionId}-tallkryss-${kind}-${i + 1}`,
        kind === 'easy' ? 2 : 3,
        `Mattekryss: finn tallet i den tomme ruta.\n${expression}`,
        `${answer}  (${expression.replace('___', String(answer))})`,
      )
    }),
  )

// ---------------------------------------------------------------------------------------
// Måleenheter (Måling): «Sammenlign måleenheter» – bare radene med kilogram og gram (økta om kilogram og gram).
// Radene med milliliter (volum), km/m/dm og cm²/m² er tatt ut: de bruker enheter som ikke hører til innholdsplanen
// for Måling på 4. trinn (ml, tonn, mg, km, omgjøring mellom cm² og m²). Arket «Lengde cm/mm» og «Hvem eier bilene?»
// er tatt ut med lengdeøkta – lengde med desimaltall hører til Tall og regning.

/** Hver enhet i gram. */
const grams: Record<string, number> = { kg: 1000, g: 1 }

/** «5 kg» eller «2010 g» → gram. */
export function measure(value: string) {
  const [amount, unit] = value.trim().split(/\s+/)
  return Number(amount.replace(',', '.')) * grams[unit]
}

const compareSign = (a: string, b: string) => (measure(a) > measure(b) ? '>' : measure(a) < measure(b) ? '<' : '=')

/** «Sammenlign måleenheter» – radene med kilogram og gram. */
const massComparisons: [string, string, string][] = [
  ['5 kg', '2000 g', '2010 g'],
  ['8000 g', '5 kg', '6000 g'],
]

const comparisonTask = (id: string, [a, b, c]: [string, string, string]) =>
  textTask(id, 3, `Sett inn riktig tegn: <, > eller =.\n${a} ___ ${b} ___ ${c}`, `${a} ${compareSign(a, b)} ${b} ${compareSign(b, c)} ${c}`)

const massCompareTasks = (sessionId: string): SessionTask[] => massComparisons.map((row, i) => comparisonTask(`ark-${sessionId}-sammenlign-${i + 1}`, row))

/** Legger oppgavene fra flere ark etter hverandre i samme økt. */
function collect(entries: [string, SessionTask[]][]) {
  const all: Record<string, SessionTask[]> = {}
  for (const [sessionId, tasks] of entries) all[sessionId] = [...(all[sessionId] ?? []), ...tasks]
  return all
}

/**
 * Del av «Oppgaver med deling» og «Gangetabell 1–100» → økt i Divisjon (del 5 ligger i Repetisjon høst).
 * Divisjon økt 3 og 4 (delingsdivisjon, målingsdivisjon) får bare delestykkene. Økt 7 «Bruke modeller i
 * divisjon» får ingen ark: gangetabellarket og bolteoppgavene bruker ingen modell.
 */
const sharingSessions: [number, string, boolean][] = [
  [0, 'divisjon-1', true],
  [1, 'divisjon-2', true],
  [2, 'divisjon-3', false],
  [3, 'divisjon-4', false],
  [4, 'divisjon-8', true],
  [5, 'repetisjon-host-4', true],
]

/** Gangearkene → økt nr. 1–9 i Multiplikasjon (økt 7 og 10 har ingen ark som passer). */
const multiplicationSessions = [1, 2, 3, 4, 5, 6, 8, 9]

export const worksheetTasks: Record<string, SessionTask[]> = collect([
  // Tall. Økt 5 og 6 (tall-5, tall-6) har ingen ark: grunnoppgavene kommer fra undertemaene i årsplanen.
  // okt-7 «Oppstilling med tall over 1000» og okt-8 «Negative tall og tallinjen» får ikke de generelle
  // pluss- og minusarkene: okt-7 får oppstillingsarkene på nivå 2 og 3, okt-8 bare oppgavene fra årsplanen.
  ...sessionIds.slice(0, 2).map((sessionId, part): [string, SessionTask[]] => [sessionId, additionTasks(part)]),
  ['okt-7', columnTasks('okt-7')],
  // Multiplikasjon og divisjon
  ...multiplicationSessions.map((n): [string, SessionTask[]] => [`multiplikasjon-${n}`, multiplicationTasks(`multiplikasjon-${n}`, n)]),
  ['divisjon-1', timesCrossTasks('divisjon-1')],
  ...sharingSessions.map(([part, sessionId, withTimesTable]): [string, SessionTask[]] => [sessionId, sharingTasks(sessionId, part, withTimesTable)]),
  // Repetisjon høst
  ['repetisjon-host-1', numberReviewTasks('repetisjon-host-1', 'tallforstaelse')],
  ['repetisjon-host-2', numberReviewTasks('repetisjon-host-2', 'addisjon-subtraksjon')],
  ['repetisjon-host-5', orderTasks('repetisjon-host-5', 0)],
  ['repetisjon-host-6', orderTasks('repetisjon-host-6', 1)],
  // Vår
  ['strategier-i-divisjon-1', divisionTasks('strategier-i-divisjon-1')],
  ['monster-og-algoritmer-2', sequenceSessionTasks('monster-og-algoritmer-2')],
  ['maling-2', massCompareTasks('maling-2')],
  ['maling-4', areaTasks('maling-4')],
  ['maling-6', [...clockTasks('maling-6', 0), ...clockTasks('maling-6', 1)]],
  ['repetisjon-var-2', [...clockTasks('repetisjon-var-2', 2), ...clockTasks('repetisjon-var-2', 3)]],
])
