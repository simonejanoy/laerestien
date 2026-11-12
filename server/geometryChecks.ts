import { isMathDraft, type AiTaskDraft, type GeometryArea } from '../src/ai/contract.ts'

// Faglige kontroller for AI-oppgaver i Geometri. Ingen geometrimotor: bare fakta som står eksplisitt i
// teksten kontrolleres (gradtall og vinkeltype, antall sider, hjørner, kanter og flater, nett og
// manglende del av 90° eller 180°). Det som ikke kan leses sikkert, avvises ikke – prompten og
// referansene styrer de åpne oppgavene. Kontrollene gjelder alltid – også med «Andre ønsker».

export type GeometryProblem = 'missingFigure' | 'wrongAngle' | 'wrongFact' | 'wrongTerm' | 'wrongSolution' | 'offTopic' | 'format'

export interface GeometryContext {
  area: GeometryArea
  secondaryAreas?: readonly GeometryArea[]
}

// ---------------------------------------------------------------------------------------------
// Tekst

export const sentences = (text: string) => text.split(/(?<=[.?!:;])\s+|\n+/).filter(Boolean)
const lower = (text: string) => text.toLowerCase()

const NUMBER_WORDS: Record<string, number> = {
  null: 0, ingen: 0, en: 1, ett: 1, én: 1, ei: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9, ti: 10, elleve: 11, tolv: 12,
}
// «en», «ett» og «ei» er som regel artikler – bare «én» regnes som tallet 1.
const NUMBER = String.raw`(\d+|null|ingen|én|to|tre|fire|fem|seks|sju|syv|åtte|ni|ti|elleve|tolv)`
const toNumber = (word: string) => (/^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word])

/** Teksten viser til en figur, et bilde eller en tabell som ikke finnes i appen. */
export const MISSING_FIGURE =
  /\bse (på )?(figuren|bildet|tegningen|illustrasjonen|skissen|tabellen)\b|\b(figuren|bildet|tegningen|illustrasjonen|skissen) (under|over|nedenfor|ovenfor|til høyre|til venstre)\b|\bsom (vist|du ser) (på|i) (figuren|bildet|tegningen)\b|\bsom vist\b|\b(på|i) (figuren|bildet|tegningen) (under|over|nedenfor)\b/i

/** Eleven vurderer en påstand – den bevisste feilen i oppgaveteksten er lov. */
export const CLAIM = /\b(har \p{L}+ rett|stemmer det|sier at|sier:|hevder|påstår|påstanden|finn feilen|er det sikkert|kan du vite sikkert)\b/iu

// ---------------------------------------------------------------------------------------------
// Vinkler

type AngleType = 'spiss' | 'rett' | 'stump' | 'rett linje' | 'hel'

/** Vinkeltypen et gradtall gir. */
export function angleType(degrees: number): AngleType | null {
  if (degrees <= 0) return null
  if (degrees < 90) return 'spiss'
  if (degrees === 90) return 'rett'
  if (degrees < 180) return 'stump'
  if (degrees === 180) return 'rett linje'
  if (degrees === 360) return 'hel'
  return null
}

/** Vinkeltypen et ord eller uttrykk beskriver («butt» og «stump» er det samme). */
export function namedAngle(text: string): AngleType | null {
  const t = lower(text)
  if (/rett linje|halv omdreining|rettlinjet/.test(t)) return 'rett linje'
  if (/hel omdreining/.test(t)) return 'hel'
  if (/\bspiss\w*/.test(t)) return 'spiss'
  if (/\b(stump|butt)\w*/.test(t)) return 'stump'
  if (/\brett(e)?\b/.test(t)) return 'rett'
  return null
}

const DEGREES = /(\d+)\s*(?:°|grader\b)/g
const degreesIn = (text: string) => [...text.matchAll(DEGREES)].map((m) => Number(m[1]))
export const ANGLE_WORD = /\b(spiss\w*|stump\w*|butt\w*|rett(e)? vinkel|rett linje|halv omdreining)\b/i

/**
 * Vinkler med gradtall:
 * - «135 grader er spiss» i en setning: gradtallet og vinkeltypen må passe sammen
 * - spørsmål om typen til ett gradtall («Er en vinkel på 40 grader spiss, rett eller stump?»): fasiten må passe
 * - kvart, halv og hel omdreining: 90°, 180° og 360°
 * - den manglende delen av en rett vinkel (90°), en rett linje (180°) eller vinkelsummen i en trekant (180°)
 */
function angleProblem(studentText: string, solution: string): GeometryProblem | null {
  const claim = CLAIM.test(studentText)
  const statements = [...(claim ? [] : sentences(studentText)), ...sentences(solution)]
  for (const sentence of statements) {
    for (const m of sentence.matchAll(/(\d+)\s*(?:°|grader)\s+(?:er|blir|kalles|gir)\s+(?:en\s+|et\s+)?(?:(?!større|mindre|enn)\p{L}+\s+)?(spiss\w*|stump\w*|butt\w*|rett(?:e)?(?:\s+(?:vinkel|linje))?)/giu)) {
      const named = namedAngle(m[2])
      if (named && named !== angleType(Number(m[1]))) return 'wrongAngle'
    }
    for (const m of sentence.matchAll(/\b(kvart|halv|hel)\s+omdreining\w*\s+(?:er|tilsvarer|blir|=)\s+(\d+)/gi)) {
      const expected = { kvart: 90, halv: 180, hel: 360 }[lower(m[1]) as 'kvart' | 'halv' | 'hel']
      if (Number(m[2]) !== expected) return 'wrongAngle'
    }
  }
  if (claim) return null

  // Spørsmål om vinkeltypen til ett gradtall.
  const given = [...new Set(degreesIn(studentText))]
  if (given.length === 1 && /hva kalles|hvilken (type )?vinkel|spiss|stump|butt|\brett\b/i.test(studentText) && /\?/.test(studentText)) {
    const asksType = /hva kalles|hvilken type|(spiss|stump|butt)[^?]*\?/i.test(studentText)
    const answer = solution.match(ANGLE_WORD)?.[0]
    if (asksType && answer && namedAngle(answer) !== angleType(given[0])) return 'wrongAngle'
  }

  // Den manglende delen: én kjent vinkel og en kjent sum.
  const question = sentences(studentText).find((s) => /hvor (stor|mange grader)/i.test(s))
  if (question) {
    const total = /trekant/i.test(studentText) ? 180 : /rett linje|halv omdreining/i.test(studentText) ? 180 : /rett vinkel/i.test(studentText) ? 90 : null
    const parts = degreesIn(studentText).filter((d) => d !== total)
    const triangle = /trekant/i.test(studentText)
    if (total && (parts.length === 1 || (triangle && parts.length === 2)) && !/dobbelt|halvparten|like store|ganger så/i.test(studentText)) {
      const expected = total - parts.reduce((a, b) => a + b, 0)
      const stated = /\d+/.exec(solution)
      if (expected > 0 && stated && Number(stated[0]) !== expected) return 'wrongSolution'
    }
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Figurer: sider, hjørner, kanter og flater

export type Part = 'sider' | 'hjørner' | 'vinkler' | 'rette vinkler' | 'kanter' | 'flater' | 'endeflater' | 'sideflater' | 'grunnflater' | 'symmetrilinjer'
type Shape = 'kvadrat' | 'rektangel' | 'trekant' | 'sirkel'

export interface Figure {
  name: string
  pattern: RegExp
  dimension: 2 | 3
  parts: Partial<Record<Part, number>>
  /** Flatene (og nettet): antall av hver form. Rektangel og kvadrat kan telles sammen (`squareOrRectangle`). */
  faces?: Partial<Record<Shape, number>>
  squareOrRectangle?: number
}

/** Figurene kontrollen kjenner. De mest spesifikke navnene står først. */
const FIGURES: Figure[] = [
  { name: 'trekantet prisme', pattern: /trekantet prisme|prisme med trekant\w* (ende|grunn)flate/i, dimension: 3, parts: { flater: 5, kanter: 9, hjørner: 6, endeflater: 2, sideflater: 3 }, faces: { trekant: 2, rektangel: 3 } },
  {
    name: 'firkantet pyramide',
    pattern: /firkantet pyramide|kvadratisk pyramide|pyramide med (kvadratisk|firkantet) grunnflate/i,
    dimension: 3,
    parts: { flater: 5, kanter: 8, hjørner: 5, sideflater: 4, grunnflater: 1 },
    faces: { kvadrat: 1, trekant: 4 },
  },
  { name: 'trekantet pyramide', pattern: /trekantet pyramide/i, dimension: 3, parts: { flater: 4, kanter: 6, hjørner: 4 }, faces: { trekant: 4 } },
  {
    name: 'firkantet prisme',
    pattern: /firkantet prisme|rektangulært prisme|\b(sko)?esk(e|en|a)\b/i,
    dimension: 3,
    parts: { flater: 6, kanter: 12, hjørner: 8 },
    faces: { trekant: 0, sirkel: 0 },
    squareOrRectangle: 6,
  },
  { name: 'kube', pattern: /\bkube\w*|\bterning\w*/i, dimension: 3, parts: { flater: 6, kanter: 12, hjørner: 8 }, faces: { kvadrat: 6, trekant: 0, sirkel: 0 } },
  { name: 'sylinder', pattern: /\bsylinder\w*/i, dimension: 3, parts: { endeflater: 2, sideflater: 1, hjørner: 0 }, faces: { sirkel: 2, rektangel: 1, trekant: 0, kvadrat: 0 } },
  { name: 'kule', pattern: /\bkule(n|r|ne)?\b/i, dimension: 3, parts: { endeflater: 0, kanter: 0, hjørner: 0 }, faces: { sirkel: 0, kvadrat: 0, rektangel: 0, trekant: 0 } },
  { name: 'kvadrat', pattern: /\bkvadrat(et)?\b/i, dimension: 2, parts: { sider: 4, hjørner: 4, vinkler: 4, 'rette vinkler': 4, symmetrilinjer: 4 } },
  { name: 'rektangel', pattern: /\brektangel(et)?\b/i, dimension: 2, parts: { sider: 4, hjørner: 4, vinkler: 4, 'rette vinkler': 4 } },
  { name: 'trekant', pattern: /\btrekant(en)?\b/i, dimension: 2, parts: { sider: 3, hjørner: 3, vinkler: 3 } },
  { name: 'rombe', pattern: /\brombe(n)?\b/i, dimension: 2, parts: { sider: 4, hjørner: 4, vinkler: 4 } },
  { name: 'firkant', pattern: /\bfirkant(en)?\b/i, dimension: 2, parts: { sider: 4, hjørner: 4, vinkler: 4 } },
  { name: 'femkant', pattern: /\bfemkant(en)?\b/i, dimension: 2, parts: { sider: 5, hjørner: 5, vinkler: 5 } },
  { name: 'sekskant', pattern: /\bsekskant(en)?\b/i, dimension: 2, parts: { sider: 6, hjørner: 6, vinkler: 6 } },
  { name: 'åttekant', pattern: /\båttekant(en)?\b/i, dimension: 2, parts: { sider: 8, hjørner: 8, vinkler: 8 } },
  { name: 'sirkel', pattern: /\bsirkel(en)?\b/i, dimension: 2, parts: { sider: 0, hjørner: 0 } },
]

/** Opptalte former («3 sirkler», «ett rektangel») er deler av en flate eller et nett – ikke figuren setningen handler om. */
const COUNTED_SHAPE = new RegExp(String.raw`(?<![\p{L}\d])(?:${NUMBER.slice(1, -1)}|en|ett|ei)\s+(?:\p{L}+\s+)?(?:kvadrat|rektang|trekant|sirk)\p{L}*`, 'giu')
export const subjectFigures = (sentence: string) => figuresIn(sentence.replace(COUNTED_SHAPE, ' '))

/** Faktaene om en figur med dette norske navnet («femkant», «kvadrat» …). */
export const figureNamed = (name: string) => FIGURES.find((f) => f.name === name)

/** Figurene som er nevnt i teksten (de mest spesifikke vinner: «firkantet prisme» er ikke også en «firkant»). */
export function figuresIn(text: string): Figure[] {
  let rest = text
  const found: Figure[] = []
  for (const figure of FIGURES) {
    if (figure.pattern.test(rest)) {
      found.push(figure)
      rest = rest.replace(new RegExp(figure.pattern.source, 'gi'), ' ')
    }
  }
  return found
}

const PART_WORDS: [RegExp, Part][] = [
  [/^rette vinkl/, 'rette vinkler'],
  [/^vinkl|^vinkel/, 'vinkler'],
  [/^sideflate/, 'sideflater'],
  [/^endeflate/, 'endeflater'],
  [/^grunnflate/, 'grunnflater'],
  [/^flate/, 'flater'],
  [/^sid(e|er|ene)$/, 'sider'],
  [/^hjørne/, 'hjørner'],
  [/^kant/, 'kanter'],
  [/^symmetrilinje/, 'symmetrilinjer'],
]
const SHAPE_WORDS: [RegExp, Shape][] = [
  [/^kvadrat/, 'kvadrat'],
  [/^rektangl|^rektangel/, 'rektangel'],
  [/^trekant/, 'trekant'],
  [/^sirk/, 'sirkel'],
]

/**
 * «4 like lange sider», «tre rektangulære sideflater», «6 kvadrater» – men ikke «to par parallelle sider»
 * eller «én flate av en terning» (en del av figuren, ikke antallet).
 */
const COUNT = new RegExp(String.raw`(?<![\p{L}\d])${NUMBER}\s+((?:(?!par\b|av\b|og\b)\p{L}+\s+){0,2}?)(rette vinkl\p{L}*|\p{L}+)(?!\s+(?:av|i hver|på hver)\b)`, 'giu')

export function countsIn(sentence: string) {
  const parts: [Part, number][] = []
  const shapes: [Shape, number][] = []
  for (const m of lower(sentence).matchAll(COUNT)) {
    const value = toNumber(m[1])
    if (value === undefined) continue
    const adjectives = m[2] ?? ''
    const word = m[3]
    const target = /rett(e)?\s+$/.test(adjectives) && /^vink/.test(word) ? 'rette vinkler' : word
    const part = PART_WORDS.find(([re]) => re.test(target))?.[1]
    if (part) {
      parts.push([part, value])
      continue
    }
    const shape = SHAPE_WORDS.find(([re]) => re.test(word))?.[1]
    if (shape) shapes.push([shape, value])
  }
  return { parts, shapes }
}

/**
 * Fakta om figurer som står eksplisitt:
 * - antall sider, hjørner, vinkler, kanter, flater og symmetrilinjer for figuren setningen handler om
 *   (figuren i setningen, ellers den ene figuren i oppgaveteksten, ellers figuren fasiten navngir)
 * - formene på flatene og i nettet (kube: 6 kvadrater, sylinder: 2 sirkler og 1 rektangel …)
 * - begreper: sider om plane figurer, flater og kanter om romfigurer
 * - «alle romfigurer med seks flater er kuber» og «seks kvadrater er alltid et kubenett» er feil
 */
function figureProblem(studentText: string, solution: string): GeometryProblem | null {
  const claim = CLAIM.test(studentText)
  const taskFigures = figuresIn(studentText)
  const solutionFigures = figuresIn(solution)
  // Figuren svaret gjelder: én figur i oppgaveteksten, eller (når oppgaven spør hvilken figur) figuren fasiten navngir.
  const asksName = /hva heter|hvilken (rom)?figur|hvilken (todimensjonal|tredimensjonal) figur|hva kalles figuren/i.test(studentText)
  // Sammenligner spørsmålet («… flere hjørner enn en firkant?», «… til sammen …»), gjelder svaret ikke figuren i spørsmålet.
  const comparing = /\b(flere|færre|til sammen|enn|dobbelt|halvparten|forskjell)\b/i.test(studentText)
  const answerFigure = asksName && solutionFigures.length >= 1 ? solutionFigures[0] : taskFigures.length === 1 && !comparing ? taskFigures[0] : null

  const check = (sentence: string, figure: Figure | null): GeometryProblem | null => {
    // Nektende setninger («… er ikke et rektangel») kan ikke leses sikkert.
    if (!figure || /\b(ikke|aldri)\b/i.test(sentence)) return null
    const { parts, shapes } = countsIn(sentence)
    for (const [part, value] of parts) {
      // Begreper: en plan figur har sider – ikke flater eller kanter. En romfigur har flater – ikke sider.
      if (figure.dimension === 2 && ['flater', 'kanter', 'sideflater', 'endeflater', 'grunnflater'].includes(part)) return 'wrongTerm'
      if (figure.dimension === 3 && part === 'sider') return 'wrongTerm'
      const expected = figure.parts[part]
      if (expected !== undefined && expected !== value) return 'wrongFact'
    }
    if (figure.dimension === 3 && figure.faces && shapes.length > 0) {
      for (const [shape, value] of shapes) {
        const expected = figure.faces[shape]
        if (expected !== undefined && expected !== value && !(figure.name === 'firkantet prisme' && (shape === 'kvadrat' || shape === 'rektangel'))) return 'wrongFact'
      }
      if (figure.squareOrRectangle !== undefined) {
        const boxes = shapes.filter(([s]) => s === 'kvadrat' || s === 'rektangel').reduce((n, [, v]) => n + v, 0)
        // Bare når alle flatene er nevnt: «fire rektangler» kan være en del av nettet.
        if (boxes > figure.squareOrRectangle) return 'wrongFact'
      }
    }
    return null
  }

  // Oppgaveteksten (ikke i vurderingsoppgaver, der påstanden kan være bevisst feil). En setning uten
  // figurnavn kontrolleres bare når den beskriver én figur («En figur har …», «Jeg har …»).
  if (!claim) {
    for (const sentence of sentences(studentText)) {
      const own = subjectFigures(sentence)
      const describesOne = /^(en|ei|et|jeg|figuren|romfiguren|den|denne)\b[^.?!]*\bhar\b/i.test(sentence.trim())
      const problem = check(sentence, own.length === 1 ? own[0] : own.length === 0 && describesOne ? answerFigure : null)
      if (problem) return problem
    }
  }
  // Fasiten: figuren i setningen, ellers – bare i den første setningen (selve svaret) – figuren svaret gjelder.
  for (const [i, sentence] of sentences(solution).entries()) {
    const own = subjectFigures(sentence)
    const problem = check(sentence, own.length === 1 ? own[0] : own.length === 0 && i === 0 ? answerFigure : null)
    if (problem) return problem
  }

  // Seks flater eller seks kvadrater bestemmer ikke alene en kube.
  const all = `${solution}`
  if (/\b(alle|enhver|hver)\b[^.?!]{0,30}\b(6|seks) flater[^.?!]{0,20}\b(er|blir) (en |et )?kube/i.test(all)) return 'wrongFact'
  if (/\b(6|seks) (like )?kvadrater\b[^.?!]{0,40}\b(alltid|sikkert|uansett)\b[^.?!]{0,30}\bkube/i.test(all) && !/\b(ikke|nei)\b/i.test(all)) return 'wrongFact'
  if (/\b(sikkert|alltid)\b[^.?!]*\bkube/i.test(studentText) && /\b(6|seks) (like )?(kvadrater|flater)\b/i.test(studentText) && /^\s*ja\b/i.test(solution)) {
    return 'wrongFact'
  }
  // Kulen kan rulle.
  if (/\bkule(n)?\b[^.?!]{0,20}\bkan ikke rulle/i.test(all)) return 'wrongFact'
  return null
}

// ---------------------------------------------------------------------------------------------
// Fagområdet

const AREA_WORDS: Record<GeometryArea, RegExp> = {
  'todimensjonale-figurer': /trekant|firkant|kvadrat|rektang|femkant|sekskant|åttekant|mangekant|sirkel|rombe|parallellogram|trapes|symmetri|\bsider?\b|sidene|hjørne|plan figur|todimensjonal/i,
  'tredimensjonale-figurer': /kube|terning|kule|sylinder|prisme|pyramide|kjegle|romfigur|flate|\bkant|hjørne|tredimensjonal|eske/i,
  'fra-3d-til-2d': /\bnett\w*|brett\w*|utbrett\w*|avtrykk|tegn\w* rundt|flate|klipp\w* opp|todimensjonal/i,
  vinkler: /vinkel|vinkl|grader|°|omdreining|viser(ne)?\b/i,
}
/** Deltema som ikke hører til noen av geometriøktene (areal og omkrets er Måling). */
const OTHER_TOPIC = /\bomkrets|\bareal|cm²|m²|kvadratcentimeter|volum/i

/**
 * Kontrollerer én AI-oppgave i en geometriøkt: figur som mangler, deltema utenfor økta, fagområdet,
 * vinkler og figurfakta.
 */
export function geometryProblem(task: AiTaskDraft, { area, secondaryAreas = [] }: GeometryContext): GeometryProblem | null {
  const studentText = isMathDraft(task) ? task.instruction : task.studentText
  const solution = isMathDraft(task) ? '' : task.solution
  const all = `${studentText} ${solution}`

  // «Se på figuren» er bare i orden når oppgaven faktisk har en figur appen tegner (se visualChecks.ts).
  if (MISSING_FIGURE.test(studentText) && (isMathDraft(task) || !task.figure)) return 'missingFigure'
  if (OTHER_TOPIC.test(all)) return 'offTopic'
  // Ingen regnestykker i geometriøktene. I vinkeløktene ville «90 − 10 =» under teksten røpe hvordan oppgaven løses:
  // vinkelberegninger er tekstoppgaver, og fasiten viser utregningen. Ellers ville et regnestykke vært forkledd regnetrening.
  if (isMathDraft(task)) return area === 'vinkler' ? 'format' : 'offTopic'
  const areas = [area, ...secondaryAreas]
  // En figur appen tegner er selv geometriinnholdet («Hva heter figuren?»); om den hører til økta, avgjør visualChecks.ts.
  // Men en tekst uten geometriord som regner med tall, handler om noe annet (f.eks. divisjon) selv med en figur.
  const hasVisual = !isMathDraft(task) && !!task.figure
  if (!areas.some((a) => AREA_WORDS[a].test(studentText)) && (!hasVisual || /\d/.test(studentText))) return 'offTopic'

  return angleProblem(studentText, solution) ?? figureProblem(studentText, solution)
}
