// Det appen og API-serveren sender til hverandre. Brukes begge steder, så filen
// skal ikke importere noe (serveren kjører TypeScript direkte i Node).

export type AiLevel = 1 | 2 | 3

export type AiOperator = '+' | '-' | '*' | '/'

interface AiDraftBase {
  level: AiLevel
  /** Kompetansemål – bare hvis læreren har oppgitt det, ellers tomt. */
  competenceGoal: string
  /** Kort forklaring på tilpasningen. */
  adaptation: string
  /** Modellen som laget akkurat denne oppgaven (satt av serveren; kan skille seg fra svaret ved utfylling). */
  servedBy?: { model: string; fallbackUsed: boolean }
}

// ---------------------------------------------------------------------------------------------
// Figurer i geometrioppgaver. AI-en velger bare en type fra listene; appen tegner selv en matematisk
// korrekt SVG (src/components/ui/GeometryFigure.ts). Ingen bilder og ingen 3D-figurer.

/** Plane figurer appen kan tegne. */
export const SHAPE_KINDS = ['triangle', 'square', 'rectangle', 'quadrilateral', 'pentagon', 'hexagon', 'octagon', 'circle'] as const
export type ShapeKind = (typeof SHAPE_KINDS)[number]
/** Vinkeltyper appen kan tegne. */
export const ANGLE_KINDS = ['acute', 'right', 'obtuse'] as const
export type AngleKind = (typeof ANGLE_KINDS)[number]

/** Gradtallet som tegnes når AI-en ikke oppgir grader. */
export const DEFAULT_ANGLE_DEGREES: Record<AngleKind, number> = { acute: 45, right: 90, obtuse: 120 }

/** Figuren til en oppgave: en plan figur eller en vinkel. Lagres i `figure` på tekstoppgaven. */
export type AiVisual = { kind: 'shape'; shape: ShapeKind } | { kind: 'angle'; angleType: AngleKind; degrees?: number }

/** Norske navn – i AI-skjemaet («figur.form») og i teksten eleven leser. */
export const SHAPE_NAMES: Record<ShapeKind, string> = {
  triangle: 'trekant',
  square: 'kvadrat',
  rectangle: 'rektangel',
  quadrilateral: 'firkant',
  pentagon: 'femkant',
  hexagon: 'sekskant',
  octagon: 'åttekant',
  circle: 'sirkel',
}
export const ANGLE_NAMES: Record<AngleKind, string> = { acute: 'spiss', right: 'rett', obtuse: 'stump' }

/** Om gradtallet passer vinkeltypen: spiss 0 < v < 90, rett 90, stump 90 < v < 180 (hele grader). */
export function degreesFit(angleType: AngleKind, degrees: number) {
  if (!Number.isInteger(degrees)) return false
  if (angleType === 'acute') return degrees > 0 && degrees < 90
  if (angleType === 'right') return degrees === 90
  return degrees > 90 && degrees < 180
}

/** Figuren i appens format (lagring og visning), eller null når den ikke er gyldig. */
export function readStoredVisual(value: unknown): AiVisual | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (v.kind === 'shape') return (SHAPE_KINDS as readonly unknown[]).includes(v.shape) ? { kind: 'shape', shape: v.shape as ShapeKind } : null
  if (v.kind === 'angle' && (ANGLE_KINDS as readonly unknown[]).includes(v.angleType)) {
    const angleType = v.angleType as AngleKind
    if (v.degrees === undefined) return { kind: 'angle', angleType }
    return typeof v.degrees === 'number' && degreesFit(angleType, v.degrees) ? { kind: 'angle', angleType, degrees: v.degrees } : null
  }
  return null
}

/**
 * Feltet «figur» i AI-svaret. Mangler det, eller er typen «ingen», blir det ingen figur (`{}`).
 * En ukjent figur, eller en vinkeltype som ikke passer gradtallet, gir `{ invalid: true }` – oppgaven
 * avvises da i kvalitetskontrollen (og erstattes), i stedet for å vises uten figuren den viser til.
 */
export function readVisual(raw: unknown): { visual?: AiVisual; invalid?: true; none?: true } {
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== 'object') return { invalid: true }
  const { type, form, vinkeltype, grader } = raw as Record<string, unknown>
  if (type === 'ingen') return { none: true }
  if (type === undefined || type === '') return {}
  if (type === 'figur') {
    const shape = (Object.keys(SHAPE_NAMES) as ShapeKind[]).find((k) => SHAPE_NAMES[k] === form)
    return shape ? { visual: { kind: 'shape', shape } } : { invalid: true }
  }
  if (type === 'vinkel') {
    const angleType = (Object.keys(ANGLE_NAMES) as AngleKind[]).find((k) => ANGLE_NAMES[k] === vinkeltype)
    if (!angleType) return { invalid: true }
    if (grader === undefined || grader === null) return { visual: { kind: 'angle', angleType } }
    return typeof grader === 'number' && degreesFit(angleType, grader) ? { visual: { kind: 'angle', angleType, degrees: grader } } : { invalid: true }
  }
  return { invalid: true }
}

/** Kort, stabil beskrivelse av figuren (til duplikatkontrollen), f.eks. «shape:pentagon» eller «angle:acute:30». */
export const visualSignature = (visual?: AiVisual) =>
  !visual ? '' : visual.kind === 'shape' ? `shape:${visual.shape}` : `angle:${visual.angleType}:${visual.degrees ?? DEFAULT_ANGLE_DEGREES[visual.angleType]}`

/** Tekstoppgave: eleven skriver svaret, og læreren ser på det. Uten `format` er det en tekstoppgave. */
export interface AiTextDraft extends AiDraftBase {
  format?: 'text'
  /** Oppgavetekst til eleven. */
  studentText: string
  /** Fasit eller løsningsforslag til læreren. */
  solution: string
  /** Geometri: figuren appen tegner til oppgaven. */
  figure?: AiVisual
  /** Satt av serveren når AI-en oppga en figur appen ikke kan tegne – oppgaven avvises da. */
  invalidFigure?: true
  /** Satt av serveren når AI-en uttrykkelig svarte «ingen figur» (betyr noe ved justering av en oppgave med figur). */
  noFigure?: true
}

/** Kort regnestykke (tall – regneart – tall), vist som de vanlige hoderegningsoppgavene. Appen retter svaret selv. */
export interface AiMathDraft extends AiDraftBase {
  format: 'math'
  taskType: 'Hoderegning' | 'Oppstilling'
  /** Kort instruksjon over regnestykket, f.eks. «Regn ut.». */
  instruction: string
  a: number
  operator: AiOperator
  b: number
}

/** Én oppgave fra AI-en, slik appen bruker den. */
export type AiTaskDraft = AiTextDraft | AiMathDraft

export const isMathDraft = (draft: AiTaskDraft): draft is AiMathDraft => draft.format === 'math'

const MAX_OPERAND = 100_000
const operatorSymbols: Record<AiOperator, string> = { '+': '+', '-': '−', '*': '·', '/': ':' }

/** Svaret på regnestykket, eller null hvis det ikke er et helt tall ≥ 0 (som appen kan rette). */
export function mathAnswer(a: number, operator: AiOperator, b: number): number | null {
  if (!(operator in operatorSymbols)) return null
  if (![a, b].every((x) => Number.isInteger(x) && x >= 0 && x <= MAX_OPERAND)) return null
  const answer = operator === '+' ? a + b : operator === '-' ? a - b : operator === '*' ? a * b : b === 0 ? NaN : a / b
  return Number.isInteger(answer) && answer >= 0 ? answer : null
}

/** «5 · 3» */
export const mathExpression = ({ a, operator, b }: Pick<AiMathDraft, 'a' | 'operator' | 'b'>) => `${a} ${operatorSymbols[operator]} ${b}`

/** Regnestykke som tekstoppgave – for steder som bare viser tekstoppgaver (elevforslag og justering). */
export function asTextDraft(draft: AiTaskDraft): AiTextDraft {
  if (!isMathDraft(draft)) return draft
  return {
    format: 'text',
    level: draft.level,
    studentText: `${draft.instruction}\n${mathExpression(draft)} = ___`,
    solution: String(mathAnswer(draft.a, draft.operator, draft.b)),
    competenceGoal: draft.competenceGoal,
    adaptation: draft.adaptation,
  }
}

/**
 * Hvilken modell som svarte. Valgfritt, så eldre svar uten feltet fortsatt er gyldige.
 * `fallbackUsed` er true når hovedmodellen var midlertidig utilgjengelig.
 */
export interface AiResponseMeta {
  model: string
  fallbackUsed: boolean
  /** Sporbarhet (nyere servere): én ID per generering, regelversjon og tidspunkt. */
  requestId?: string
  rulesVersion?: string
  createdAt?: string
  /** Hovedområdet referansene ble valgt fra, og temaet det hører til. */
  area?: string
  topic?: string
  /** Frøet utvalget av referanser ble gjort med – samme frø gir samme utvalg. */
  referenceSeed?: number
  /** Referanse-ID-ene AI-en fikk, per nivå («1», «2», «3»). */
  referenceIds?: Partial<Record<'1' | '2' | '3', string[]>>
}

/**
 * Sporbarhet på hver AI-genererte oppgave. Bare for læreren og sporing – vises aldri for eleven.
 * `format` er formatet AI-en svarte med.
 */
export interface AiTaskMeta {
  model: string
  rulesVersion: string
  referenceIds: string[]
  requestId: string
  createdAt: string
  area?: string
  level: AiLevel
  format: 'regnestykke' | 'tekst'
  fallbackUsed: boolean
  referenceSeed?: number
}

export interface TaskResult {
  tasks: AiTaskDraft[]
  /** Kort beskjed fra AI-en til læreren (f.eks. om noe i bestillingen ikke kunne følges). */
  message: string
  /** Satt av serveren når resultatet er ufullstendig, f.eks. når et nivå mangler oppgaver. */
  warning?: string
  /** Generelle oppgaver: det bestilte antallet kunne ikke lages, så ingen oppgaver er med. */
  incomplete?: boolean
  meta?: AiResponseMeta
}

/** Fag og trinn – alltid med, så AI-en ikke må spørre. */
export interface SubjectContext {
  subject: string
  grade: string
}

export interface LessonContext extends SubjectContext {
  topic: string
  sessionHeading: string
  sessionDescription: string
  /** Lærerens egne mål for økta (ikke offisiell måltekst). */
  sessionGoals: string[]
}

/**
 * Det AI-en får vite om en elev: anonym ID og resultater fra appen – ikke navn, bilde
 * eller andre personopplysninger.
 */
export interface AnonStudentProfile {
  anonId: string
  /** Nivået læreren har satt i appen. */
  level: AiLevel
  firstTryPercent: number
  strong: string[]
  support: string[]
  mastery: { topic: string; status: string; note?: string }[]
  /** Observasjoner fra appen, uten navn. */
  observations: string[]
}

/** Maks antall referanseoppgaver per nivå som sendes til AI-en. */
export const MAX_REFERENCE_TASKS = 3

/** Fagområdene i multiplikasjon. Øktprofilen sier hvilket økta tilhører; referansebanken er ordnet etter dem. */
export const MULTIPLICATION_AREAS = ['tabell-2-3-4-5-10', 'tabell-6-7-8-9', 'tiere-hundrere', 'dele-opp', 'blokkmodell', 'kombinasjoner'] as const
export type MultiplicationArea = (typeof MULTIPLICATION_AREAS)[number]

/** Fagområdene i Tall og plassverdi (avrunding er ikke med i temaet nå). */
export const PLACE_VALUE_AREAS = ['hoderegning', 'firesifrede-tall', 'addisjon-subtraksjon', 'oppstilling-over-1000', 'negative-tall'] as const
export type PlaceValueArea = (typeof PLACE_VALUE_AREAS)[number]

/** Fagområdene i Divisjon, i progresjonsrekkefølge. */
export const DIVISION_AREAS = ['multiplikasjon-divisjon', 'delingsdivisjon-malingsdivisjon', 'divisjon-med-rest', 'modeller'] as const
export type DivisionArea = (typeof DIVISION_AREAS)[number]

/** Delingsdivisjon (antall grupper er kjent) eller målingsdivisjon (størrelsen på hver gruppe er kjent). */
export type DivisionType = 'deling' | 'maling'

/** Fagområdene i Geometri, i progresjonsrekkefølge. */
export const GEOMETRY_AREAS = ['todimensjonale-figurer', 'tredimensjonale-figurer', 'fra-3d-til-2d', 'vinkler'] as const
export type GeometryArea = (typeof GEOMETRY_AREAS)[number]

/** Fagområdene i Problemløsing, i progresjonsrekkefølge. */
export const PROBLEM_SOLVING_AREAS = ['regnefortelling-regneuttrykk', 'bruke-modeller', 'flerstegsoppgaver', 'flervalg-begrunnelse'] as const
export type ProblemSolvingArea = (typeof PROBLEM_SOLVING_AREAS)[number]

/** Temaene som har en referansebank på serveren, med fagområdene sine. */
export const REFERENCE_TOPICS = {
  multiplikasjon: MULTIPLICATION_AREAS,
  'tall-og-plassverdi': PLACE_VALUE_AREAS,
  divisjon: DIVISION_AREAS,
  geometri: GEOMETRY_AREAS,
  problemlosing: PROBLEM_SOLVING_AREAS,
} as const
export type ReferenceTopic = keyof typeof REFERENCE_TOPICS
/** Et fagområde i en av referansebankene. Områdene har unike ID-er på tvers av temaene. */
export type ReferenceArea = MultiplicationArea | PlaceValueArea | DivisionArea | GeometryArea | ProblemSolvingArea

export const TOPIC_TITLES: Record<ReferenceTopic, string> = {
  multiplikasjon: 'Multiplikasjon',
  'tall-og-plassverdi': 'Tall og plassverdi',
  divisjon: 'Divisjon',
  geometri: 'Geometri',
  problemlosing: 'Problemløsing',
}

export const AREA_TITLES: Record<ReferenceArea, string> = {
  'tabell-2-3-4-5-10': '2-, 3-, 4-, 5- og 10-gangen',
  'tabell-6-7-8-9': '6-, 7-, 8- og 9-gangen',
  'tiere-hundrere': 'Multiplisere med tiere og hundrere',
  'dele-opp': 'Dele opp og multiplisere',
  blokkmodell: 'Bruke blokkmodeller',
  kombinasjoner: 'Antall ulike kombinasjoner',
  hoderegning: 'Hoderegning',
  'firesifrede-tall': 'Firesifrede tall',
  'addisjon-subtraksjon': 'Addisjon og subtraksjon',
  'oppstilling-over-1000': 'Oppstilling med tall over 1000',
  'negative-tall': 'Negative tall',
  'multiplikasjon-divisjon': 'Multiplikasjon og divisjon',
  'delingsdivisjon-malingsdivisjon': 'Delingsdivisjon og målingsdivisjon',
  'divisjon-med-rest': 'Divisjon med noe til overs',
  modeller: 'Bruke modeller',
  'todimensjonale-figurer': 'Todimensjonale figurer',
  'tredimensjonale-figurer': 'Tredimensjonale figurer',
  'fra-3d-til-2d': 'Fra tredimensjonal til todimensjonal',
  vinkler: 'Vinkler',
  'regnefortelling-regneuttrykk': 'Regnefortellinger og regneuttrykk',
  'bruke-modeller': 'Bruke modeller',
  flerstegsoppgaver: 'Flerstegsoppgaver',
  'flervalg-begrunnelse': 'Flervalgsoppgaver',
}

export const isMultiplicationArea = (value: unknown): value is MultiplicationArea =>
  typeof value === 'string' && (MULTIPLICATION_AREAS as readonly string[]).includes(value)

export const isReferenceArea = (value: unknown): value is ReferenceArea =>
  typeof value === 'string' && value in AREA_TITLES

/** Temaet fagområdet hører til. */
export const topicOfArea = (area: ReferenceArea): ReferenceTopic =>
  (Object.keys(REFERENCE_TOPICS) as ReferenceTopic[]).find((topic) => (REFERENCE_TOPICS[topic] as readonly string[]).includes(area))!

/**
 * Én referanseoppgave for AI-en – bare som faglig og strukturelt grunnlag. Enten en eksisterende oppgave
 * fra økta (andre tema), eller en oppgave fra referansebanken på serveren (multiplikasjon, med ID).
 */
export interface AiReferenceTask {
  /** F.eks. «Hoderegning», «Oppstilling» eller «Tekstoppgave». For referansebanken: formatet. */
  taskType: string
  /** Det eleven ser, f.eks. «Regn ut. 5 · 3 =». */
  studentText: string
  solution?: string
  /** Bare referansebanken: stabil ID (f.eks. «M1-N1-01»), faglig hensikt og eventuell representasjon. */
  id?: string
  purpose?: string
  representation?: string
  /** Problemløsing: visuell støtte beskrevet med ord (f.eks. en tekstbasert blokkmodell) – ikke en figur som mangler. */
  support?: string
}

/** Én oppgave som allerede finnes på nivået – til oppsummeringen og duplikatkontrollen. Ingen elevdata. */
export interface AiExistingTask {
  /** «Hoderegning», «Oppstilling» eller «Tekstoppgave». */
  taskType: string
  /** Regnestykker: instruksjonen og tallene. */
  instruction?: string
  a?: number
  operator?: AiOperator
  b?: number
  /** Tekstoppgaver: teksten (forkortet). */
  text?: string
  /** Tekstoppgaven har en figur (rutefigur, klokke, plan figur eller vinkel). */
  figure?: boolean
  /** Plane figurer og vinkler: hvilken figur (visualSignature), så samme tekst med en annen figur er en annen oppgave. */
  figureKind?: string
}

/** Høyst så mange eksisterende oppgaver per nivå sendes med. */
export const MAX_EXISTING_TASKS = 80

/** Ett nivå i oppgavesettet: lærerens nivåbeskrivelse og noen representative oppgaver. */
export interface AiLevelContext {
  level: AiLevel
  title: string
  subtitle: string
  description: string
  /** Vanligste oppgavetype på nivået (tom hvis nivået ikke har oppgaver). */
  dominantTaskType: string
  /** Tallområde og utfordring på nivået i denne økta. */
  numbers?: string
  /** Gangetabellene (faktorene) på nivået. */
  factors?: number[]
  units?: string[]
  /** Høyst MAX_REFERENCE_TASKS, i samme rekkefølge som i oppgavesettet. */
  referenceTasks: AiReferenceTask[]
  /** Oppgavene som allerede finnes på nivået (bare når økta har et fagområde). */
  existing?: AiExistingTask[]
  /** Hvordan instruksjonene på nivået støtter eleven (bare når strategier er læringsfokus). */
  support?: string
}

/** Øktens oppgaveprofil, slik AI-en får den. Går foran temaets generelle beskrivelse og mål. */
export interface AiSessionProfile {
  focus: string
  /** F.eks. «gange (·)». */
  operations: string[]
  factors?: number[]
  units?: string[]
  formats: string[]
  steps: string
  avoid: string[]
  /** Hovedområdet i økta. Da velger serveren referansene fra referansebanken for området. */
  area?: ReferenceArea
  /** Tilgrensende områder økta også dekker. Gir høyst én støttereferanse; hovedfokus er `area`. */
  secondaryAreas?: ReferenceArea[]
  /** Byttede faktorer (3 · 7 og 7 · 3) er ulike oppgaver i økta, f.eks. når den handler om å bytte rekkefølge. */
  allowSwappedFactors?: boolean
  /** Strategier er læringsfokus: oppgavene følger nivåets strategistøtte, og strategiene kontrolleres. */
  strategyFocus?: boolean
  /** Tierovergang er målet: alle oppgaver må kreve minst én addisjon med veksling (kontrolleres på serveren). */
  requiresCarry?: boolean
  /** Divisjon: økta handler bare om delingsdivisjon eller bare om målingsdivisjon (kontrolleres på serveren). */
  divisionType?: DivisionType
}

export type TaskRequest =
  | {
      kind: 'general'
      lesson: LessonContext
      perLevel: number
      /** Offisiell måltekst, limt inn ordrett av læreren (kan være tom). */
      officialGoals: string
      wishes: string
      /** Nivå 1–3 med beskrivelse og referanseoppgaver. Valgfritt, så eldre bestillinger fortsatt virker. */
      levels?: AiLevelContext[]
      /** Øktens oppgaveprofil, når økta har en. */
      profile?: AiSessionProfile
      /** Bare for å gjenskape et tidligere utvalg av referanser. Ellers lager serveren et nytt frø. */
      referenceSeed?: number
    }
  | {
      kind: 'individual'
      /** Klassen eleven går i – må være lærerens egen. */
      classId: string
      context: SubjectContext
      student: AnonStudentProfile
      count: number
      wishes: string
    }
  | {
      kind: 'revise'
      context: SubjectContext & { topic: string }
      task: AiTextDraft
      instruction: string
      /** Med når oppgaven er tilpasset en elev. */
      classId?: string
      student?: AnonStudentProfile
    }

export interface ProfileRequest {
  classId: string
  context: SubjectContext
  student: AnonStudentProfile
  /** Lærerens egne observasjoner (valgfritt). */
  teacherNotes: string
}

/** Én tur i samtalen. Sendes tilbake uendret, så thought signatures blir med. */
export interface ChatContent {
  role: 'user' | 'model'
  parts: Record<string, unknown>[]
}

export interface ChatRequest {
  history: ChatContent[]
}

export interface ChatResponse {
  text: string
  /** Modellens tur, slik den kom fra API-et – legges uendret til i historikken. */
  content: ChatContent
  meta?: AiResponseMeta
}

export interface TextResponse {
  text: string
  meta?: AiResponseMeta
}

/** Feltnavnene i JSON-skjemaet (se server/taskSchema.ts). */
interface RawTask {
  figur?: unknown
  nivaa?: unknown
  format?: unknown
  oppgavetekst?: unknown
  fasit?: unknown
  oppgavetype?: unknown
  instruksjon?: unknown
  tall1?: unknown
  regneart?: unknown
  tall2?: unknown
  kompetansemaal?: unknown
  tilpasning?: unknown
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** Regneart fra skjemaet («·» og «:») eller appen («*» og «/»). */
const operatorOf = (value: unknown): AiOperator | null =>
  ({ '+': '+', '-': '-', '−': '-', '·': '*', '*': '*', ':': '/', '/': '/' })[text(value)] as AiOperator | undefined ?? null

function parseMath(item: RawTask, base: AiDraftBase): AiMathDraft | null {
  const [a, b] = [Number(item.tall1), Number(item.tall2)]
  const operator = operatorOf(item.regneart)
  const instruction = text(item.instruksjon).slice(0, 160)
  const taskType = text(item.oppgavetype) === 'Oppstilling' ? 'Oppstilling' : 'Hoderegning'
  if (!operator || !instruction || mathAnswer(a, operator, b) === null) return null
  return { ...base, format: 'math', taskType, instruction, a, operator, b }
}

/**
 * Sjekker et oppgavesvar fra AI-en. Ugyldige oppgaver fjernes – også regnestykker med
 * negativt svar, desimalsvar eller deling som ikke går opp. Returnerer null hvis svaret
 * ikke har riktig form i det hele tatt.
 */
export function parseTaskResult(raw: unknown): TaskResult | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { oppgaver, melding } = raw as { oppgaver?: unknown; melding?: unknown }
  if (!Array.isArray(oppgaver)) return null

  const tasks = oppgaver.flatMap((item: RawTask): AiTaskDraft[] => {
    if (typeof item !== 'object' || item === null) return []
    const level = Number(item.nivaa)
    if (![1, 2, 3].includes(level)) return []
    const base = { level: level as AiLevel, competenceGoal: text(item.kompetansemaal), adaptation: text(item.tilpasning) }
    if (text(item.format) === 'regnestykke') {
      const draft = parseMath(item, base)
      return draft ? [draft] : []
    }
    const studentText = text(item.oppgavetekst)
    const solution = text(item.fasit)
    if (!studentText || !solution) return []
    const { visual, invalid, none } = readVisual(item.figur)
    return [
      {
        ...base,
        studentText,
        solution,
        ...(visual && { figure: visual }),
        ...(invalid && { invalidFigure: true as const }),
        ...(none && { noFigure: true as const }),
      },
    ]
  })
  return { tasks, message: text(melding) }
}

const MAX_REFERENCE_TEXT = 500
const MAX_LEVEL_TEXT = 300
const clip = (value: unknown, max: number) => text(value).slice(0, max)

/** Liste med hele tall (f.eks. gangetabeller), eller undefined. */
function readNumbers(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined
  const list = value.filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= MAX_OPERAND).slice(0, 20)
  return list.length ? list : undefined
}

/** Liste med korte tekster, eller undefined. */
function readTexts(value: unknown, max: number, count = 10): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const list = value.map((x) => clip(x, max)).filter(Boolean).slice(0, count)
  return list.length ? list : undefined
}

/** Leser øktprofilen fra appen. Bare kjente felter, korte tekster. */
export function readSessionProfile(raw: unknown): AiSessionProfile | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const p = raw as Partial<Record<keyof AiSessionProfile, unknown>>
  const focus = clip(p.focus, MAX_LEVEL_TEXT)
  if (!focus) return undefined
  const factors = readNumbers(p.factors)
  const units = readTexts(p.units, 30)
  return {
    focus,
    operations: readTexts(p.operations, 40) ?? [],
    ...(factors && { factors }),
    ...(units && { units }),
    formats: readTexts(p.formats, 160) ?? [],
    steps: clip(p.steps, MAX_LEVEL_TEXT),
    avoid: readTexts(p.avoid, 160) ?? [],
    ...(isReferenceArea(p.area) && { area: p.area }),
    ...(isReferenceArea(p.area) &&
      Array.isArray(p.secondaryAreas) && {
        secondaryAreas: p.secondaryAreas.filter((a): a is ReferenceArea => isReferenceArea(a) && a !== p.area).slice(0, 3),
      }),
    ...(p.allowSwappedFactors === true && { allowSwappedFactors: true }),
    ...(p.strategyFocus === true && { strategyFocus: true }),
    ...(p.requiresCarry === true && { requiresCarry: true }),
    ...((p.divisionType === 'deling' || p.divisionType === 'maling') && { divisionType: p.divisionType }),
  }
}

const MAX_EXISTING_TEXT = 300
const appOperators: AiOperator[] = ['+', '-', '*', '/']

/** Leser oppgavene som allerede finnes på et nivå. Bare kjente felter, korte tekster, høyst MAX_EXISTING_TASKS. */
function readExisting(value: unknown): AiExistingTask[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.slice(0, MAX_EXISTING_TASKS).flatMap((item): AiExistingTask[] => {
    if (typeof item !== 'object' || item === null) return []
    const { taskType, instruction, a, operator, b, text: body, figure, figureKind } = item as Partial<Record<keyof AiExistingTask, unknown>>
    const type = clip(taskType, 60)
    if (!type) return []
    if (appOperators.includes(operator as AiOperator) && Number.isFinite(a) && Number.isFinite(b)) {
      return [{ taskType: type, instruction: clip(instruction, 160), a: a as number, operator: operator as AiOperator, b: b as number }]
    }
    const textBody = clip(body, MAX_EXISTING_TEXT)
    const kind = clip(figureKind, 40)
    return textBody ? [{ taskType: type, text: textBody, ...(figure === true && { figure: true }), ...(figure === true && kind && { figureKind: kind }) }] : []
  })
}

/**
 * Leser nivåkonteksten fra appen og tar bare med kjente felter, høyst ett per nivå og
 * høyst MAX_REFERENCE_TASKS referanseoppgaver per nivå. Ugyldige deler hoppes over.
 */
export function readLevelContexts(raw: unknown): AiLevelContext[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  return raw.flatMap((item): AiLevelContext[] => {
    if (typeof item !== 'object' || item === null) return []
    const level = Number((item as AiLevelContext).level)
    if (![1, 2, 3].includes(level) || seen.has(level)) return []
    seen.add(level)
    const { title, subtitle, description, dominantTaskType, referenceTasks, numbers, factors, units, existing, support } = item as Partial<
      Record<keyof AiLevelContext, unknown>
    >
    const existingTasks = readExisting(existing)
    const references = (Array.isArray(referenceTasks) ? referenceTasks : []).flatMap((ref): AiReferenceTask[] => {
      if (typeof ref !== 'object' || ref === null) return []
      const { taskType, studentText, solution } = ref as Partial<Record<keyof AiReferenceTask, unknown>>
      const reference = { taskType: clip(taskType, 60), studentText: clip(studentText, MAX_REFERENCE_TEXT) }
      if (!reference.studentText) return []
      const answer = clip(solution, MAX_REFERENCE_TEXT)
      return [answer ? { ...reference, solution: answer } : reference]
    })
    return [
      {
        level: level as AiLevel,
        title: clip(title, MAX_LEVEL_TEXT),
        subtitle: clip(subtitle, MAX_LEVEL_TEXT),
        description: clip(description, MAX_LEVEL_TEXT),
        dominantTaskType: clip(dominantTaskType, 60),
        ...(clip(numbers, MAX_LEVEL_TEXT) && { numbers: clip(numbers, MAX_LEVEL_TEXT) }),
        ...(readNumbers(factors) && { factors: readNumbers(factors) }),
        ...(readTexts(units, 30) && { units: readTexts(units, 30) }),
        referenceTasks: references.slice(0, MAX_REFERENCE_TASKS),
        ...(existingTasks && { existing: existingTasks }),
        ...(clip(support, MAX_REFERENCE_TEXT) && { support: clip(support, MAX_REFERENCE_TEXT) }),
      },
    ]
  }).sort((a, b) => a.level - b.level)
}

/** Leser metadata fra API-svaret. Mangler den eller har feil form, gir den undefined. */
export function readMeta(value: unknown): AiResponseMeta | undefined {
  const meta = (value as { meta?: unknown } | null)?.meta
  if (typeof meta !== 'object' || meta === null) return undefined
  const { model, fallbackUsed, requestId, rulesVersion, createdAt, area, referenceSeed, referenceIds } = meta as Partial<
    Record<keyof AiResponseMeta, unknown>
  >
  if (typeof model !== 'string' || typeof fallbackUsed !== 'boolean') return undefined
  const ids: AiResponseMeta['referenceIds'] = {}
  if (typeof referenceIds === 'object' && referenceIds !== null) {
    for (const level of ['1', '2', '3'] as const) {
      const list = (referenceIds as Record<string, unknown>)[level]
      if (Array.isArray(list)) ids[level] = list.filter((x): x is string => typeof x === 'string').slice(0, MAX_REFERENCE_TASKS)
    }
  }
  return {
    model,
    fallbackUsed,
    ...(typeof requestId === 'string' && { requestId }),
    ...(typeof rulesVersion === 'string' && { rulesVersion }),
    ...(typeof createdAt === 'string' && { createdAt }),
    ...(typeof area === 'string' && { area }),
    ...(typeof (meta as { topic?: unknown }).topic === 'string' && { topic: (meta as { topic: string }).topic }),
    ...(Number.isInteger(referenceSeed) && { referenceSeed: referenceSeed as number }),
    ...(Object.keys(ids).length > 0 && { referenceIds: ids }),
  }
}

/** Det samme som parseTaskResult, men for svar som allerede er gjort om (fra API-serveren til appen). */
export function isTaskResult(value: unknown): value is TaskResult {
  if (typeof value !== 'object' || value === null) return false
  const { tasks, message } = value as Partial<TaskResult>
  const common = (t: AiTaskDraft) =>
    [1, 2, 3].includes(t?.level) && typeof t.competenceGoal === 'string' && typeof t.adaptation === 'string'
  return (
    typeof message === 'string' &&
    Array.isArray(tasks) &&
    tasks.every((t) =>
      !common(t)
        ? false
        : isMathDraft(t)
          ? (t.taskType === 'Hoderegning' || t.taskType === 'Oppstilling') &&
            typeof t.instruction === 'string' &&
            t.instruction.length > 0 &&
            mathAnswer(t.a, t.operator, t.b) !== null
          : typeof t.studentText === 'string' &&
            t.studentText.length > 0 &&
            typeof t.solution === 'string' &&
            t.solution.length > 0 &&
            (t.figure === undefined || readStoredVisual(t.figure) !== null),
    )
  )
}
