import type { AiTaskMeta, AiVisual, DivisionType, ReferenceArea } from '../ai/contract.ts'
import type { ColorsFigure, DotsFigure, ExpectedAnswer } from '../ai/patternDisplay.ts'

export type Role = 'teacher' | 'student'

/** Lagres i Firestore under users/{uid}. */
export interface UserProfile {
  uid: string
  name: string
  email?: string
  role: Role
  /** F.eks. «Kontaktlærer». */
  title?: string
  /** Klassen brukeren hører til, f.eks. «4A». */
  classId?: string
  /** Elevens nivå (bare for elever). */
  level?: Level
}

export type Weekday = 'Mandag' | 'Tirsdag' | 'Onsdag' | 'Torsdag' | 'Fredag'

export interface CalendarSlot {
  day: Weekday
  /** Starttid som i timeplanen, f.eks. «08.30». */
  time: string
}

/** Én lapp i kalenderen, regnet ut fra øktene. */
export interface CalendarSession {
  id: string
  /** Økta lappen åpner (en dobbeltøkt har to lapper). */
  sessionId: string
  topic: string
  sessionNumber: number
  day: Weekday
  time: string
  year: number
  week: number
  /** Timen er over (eller økta er markert som gjennomført). */
  completed?: boolean
}

export type Level = 1 | 2 | 3

export interface LevelGroup {
  level: Level
  title: string
  subtitle: string
  description: string
  taskCount: number
  studentCount: number
}

export interface PlanItem {
  title: string
  minutes: number
  description: string
}

export interface Session {
  id: string
  /** Perioden i årsplanen økta hører til (PlanUnit-id). */
  topicId: string
  /** Kortnavn i overskriften, f.eks. «Addisjon». */
  title: string
  /** Hva økta handler om, f.eks. «Tiere, enere og smarte regnestrategier». */
  heading: string
  description: string
  topic: string
  /** Fagområdet i brødsmulene, f.eks. «De fire regneartene». */
  area: string
  className: string
  /** Visningsdato, f.eks. «Onsdag 28. oktober». */
  date?: string
  /** Klokkeslett, f.eks. «8.30 - 10.30». */
  time?: string
  /** Øktnumre – to tall betyr dobbeltøkt. */
  numbers: number[]
  /** Uka økta ligger i (år + ISO-uke), og plassen i timeplanen (én per øktnummer). */
  year: number
  week: number
  slots: CalendarSlot[]
  /** Ferdighetene (undertemaene) økta øver på – brukes til progresjon på tvers av perioder. */
  skillIds?: string[]
  /** Hva oppgavene i akkurat denne økta skal øve på. Styrer oppgavegeneratoren og AI-en. */
  taskProfile?: TaskProfile
  totalSessions: number
  levels: LevelGroup[]
  goals: string[]
  plan: PlanItem[]
}

/** completed/skipped lagres; available/locked regnes ut fra rekkefølgen. */
export type SessionStatus = 'completed' | 'skipped' | 'available' | 'locked'

export type TaskType = 'Hoderegning' | 'Oppstilling'

/**
 * Hvor oppgaven kommer fra (AI-oppgaver har i tillegg `aiGenerated`). Brukes til å velge
 * gode eksempler når AI-en lager nye oppgaver: lærerens egne først, så arbeidsark, så generert.
 */
export type TaskSource = 'teacher' | 'worksheet' | 'generated'

/** Tallområde og utfordring på ett nivå i én økt. */
export interface LevelProfile {
  /** Øktspesifikk nivåbeskrivelse – erstatter temaets generelle når den er satt. */
  title?: string
  subtitle?: string
  description?: string
  /** F.eks. «0 og 1 ganget med tall fra 0 til 10». */
  numbers: string
  /** Gangetabellene (faktorene) på nivået. Generatoren bruker bare disse. */
  factors?: number[]
  /** Måleenheter på nivået. */
  units?: string[]
  /** Antall grupper (første faktor) i gangestykkene, fra–til. */
  groups?: [number, number]
  /** Instruksjonen over regnestykkene, f.eks. «Regn ut. Doble 2-gangen.». */
  instruction?: string
  /** Hvordan oppgavene på nivået støtter eleven (sendes til AI-en som støttestruktur). */
  support?: string
}

/** Oppgaveprofil for én økt: det faglige innholdet oppgavene skal holde seg til. */
export interface TaskProfile {
  /** Konkret faglig fokus, f.eks. «Gangetegnet, 0-gangen og 1-gangen». */
  focus: string
  operations: Operator[]
  /** Alle gangetabellene økta bruker. */
  factors?: number[]
  units?: string[]
  /** Ønskede oppgaveformater, f.eks. «Hoderegning» eller «Tekstoppgave». */
  formats: string[]
  /** Antall steg og delspørsmål, f.eks. «Ett steg, ingen delspørsmål». */
  steps: string
  /** Formater og innhold som ikke skal brukes. */
  avoid: string[]
  /** Om økta bruker figurer appen kan vise (rutefigur eller klokke). AI-en kan ikke lage figurer. */
  figures: boolean
  /** Hovedområdet i økta. Da velger serveren AI-referansene fra referansebanken for området. */
  area?: ReferenceArea
  /** Tilgrensende områder økta også dekker (gir høyst én støttereferanse). Hovedfokus er `area`. */
  secondaryAreas?: ReferenceArea[]
  /** Byttede faktorer (3 · 7 og 7 · 3) regnes som ulike oppgaver, fordi økta handler om å bytte rekkefølge. */
  allowSwappedFactors?: boolean
  /**
   * Strategier er læringsfokus (f.eks. 7-, 8- og 9-gangen). Da får hvert regnestykke en strategi-
   * instruksjon som passer akkurat det stykket og nivået (se multiplicationStrategies.ts).
   */
  strategyFocus?: boolean
  /**
   * Hvilken variant av grunnoppgavene undertemaet lager for økta, når flere økter deler undertema
   * (f.eks. «strategier» for hoderegning eller «sammenligne» for firesifrede tall).
   */
  taskVariant?: string
  /** Tierovergang er det uttrykkelige målet: alle oppgaver må kreve minst én addisjon med veksling. */
  requiresCarry?: boolean
  /** Divisjon: økta handler bare om delingsdivisjon («deling») eller bare om målingsdivisjon («maling»). */
  divisionType?: DivisionType
  levels: Record<Level, LevelProfile>
}

/** Pluss, minus, gange (·) og dele (:). */
export type Operator = '+' | '-' | '*' | '/'

/** Regnestykke (tall – regneart – tall). Appen sjekker svaret selv. */
export interface Task {
  kind?: 'math'
  id: string
  level: Level
  type: TaskType
  /** Instruksjonen eleven ser over regnestykket. */
  instruction: string
  a: number
  operator: Operator
  b: number
  source?: TaskSource
  /** Laget av AI-assistenten (vises bare for læreren). */
  aiGenerated?: boolean
  /** Læreren har selv sett gjennom en AI-generert oppgave. */
  reviewed?: boolean
  /** Sporbarhet for AI-genererte oppgaver (modell, regelversjon, referanser …). Vises aldri for eleven. */
  aiMeta?: AiTaskMeta
}

/**
 * Figur som tegnes til en oppgave: rutefigur (areal), analog klokke, plan figur eller vinkel (geometri), eller
 * figurtall som prikker og fargemønstre som sirkler (Mønster og algoritmer).
 * Appen tegner alle selv som SVG (components/ui/TaskFigure.tsx).
 */
export type TaskFigure =
  /** «#» er en rute, «.» er tomt. */
  | { kind: 'grid'; rows: string[] }
  /** «HH:MM» – vises på en analog klokke. */
  | { kind: 'clock'; time: string }
  /** Plan figur (trekant, kvadrat …) eller vinkel (spiss, rett, stump) – se AiVisual. */
  | AiVisual
  /** Figurtall: antall prikker i figur 1, 2, 3 … (se ai/patternDisplay.ts). */
  | DotsFigure
  /** Fargemønster: fargene i rekka, tegnet som fylte sirkler med navnet under (se ai/patternDisplay.ts). */
  | ColorsFigure

/** Fritekstoppgave, f.eks. laget med AI-assistenten. Eleven skriver svaret, og læreren vurderer det. */
export interface TextTask {
  kind: 'text'
  id: string
  level: Level
  /** Oppgaveteksten eleven ser. */
  text: string
  /** Fasit eller løsningsforslag – bare for læreren. */
  solution: string
  /** Kompetansemål læreren har oppgitt (tomt hvis ikke oppgitt). */
  competenceGoal: string
  /** Hvordan oppgaven er tilpasset. */
  adaptation: string
  /** Laget av AI-assistenten (vises bare for læreren). */
  aiGenerated: boolean
  /** Læreren har selv sett gjennom oppgaven. */
  reviewed: boolean
  /** Figur som hører til oppgaven (valgfritt). */
  figure?: TaskFigure
  /** Mønster og algoritmer: tallrekka med tomme felt («21, ___, ___, 24») vises med en inputboks for hvert felt. */
  answerBoxes?: true
  /**
   * Mønster og algoritmer: det korte svaret appen retter automatisk (tall, tallrekke, figur eller farge). Uten feltet
   * rettes oppgaven ikke automatisk. Fjernes når teksten eller fasiten endres, så det aldri blir stående feil.
   */
  expected?: ExpectedAnswer
  source?: TaskSource
  /** Sporbarhet for AI-genererte oppgaver (modell, regelversjon, referanser …). Vises aldri for eleven. */
  aiMeta?: AiTaskMeta
}

export type SessionTask = Task | TextTask

/** Undertema/ferdighet, f.eks. «Firesifrede tall». Samme ferdighet kan øves i flere perioder. */
export interface Skill {
  id: string
  name: string
}

/** Faglig tema med undertemaer, f.eks. «Multiplikasjon». */
export interface Topic {
  id: string
  name: string
  skills: Skill[]
}

/**
 * Undervisningsperiode i årsplanen (det som vises under «Alle tema»): enten et tema,
 * eller en repetisjonsperiode som gjenbruker ferdigheter fra tidligere tema.
 */
export interface PlanUnit {
  id: string
  name: string
  /** Forslag til varighet i uker. */
  weeks: number
  kind: 'topic' | 'repetition'
  /** Temaet perioden hører til (mangler for repetisjon). */
  topicId?: string
  /** Ferdighetene perioden øver på. Repetisjon peker på ferdigheter fra tidligere tema. */
  skillIds: string[]
}

export interface PlanWeek {
  title: string
  /** Øktene i uka, i rekkefølge. Økt-nummeret er posisjonen i hele temaet. */
  sessions: string[]
}

/** Plan og mål for en periode i årsplanen. */
export interface TopicDetails {
  /** Id-en til perioden (PlanUnit). */
  topicId: string
  weeks: PlanWeek[]
  goals: string[]
}

export interface Term {
  id: 'host' | 'vinter' | 'var'
  name: string
  period: string
  units: PlanUnit[]
}

export interface Student {
  id: string
  name: string
  level: Level
  /** Bilde av eleven (valgfritt). */
  photo?: string
  /** Innloggingen (e-post) når eleven har en elevkonto. Kobler eleven i klasselista til kontoen. */
  email?: string
}

/** Elevens framdrift i en pågående økt. */
export interface StudentProgress {
  started: boolean
  /** Antall fullførte oppgaver. */
  done: number
}

/** Statistikk: hvor godt en elev eller klassen mestrer et tema. */
export type MasteryStatus = 'understanding' | 'needsSupport' | 'insufficient'

export interface TopicMastery {
  topic: string
  status: MasteryStatus
  /** Antall fylte blokker av 8. */
  filled: number
  /** «Trenger mer øving på» eller «Neste steg». */
  note?: string
}

export interface Pattern {
  text: string
  compare: { label: string; value: string; caption: string }[]
  tip: string
}

export interface StudentStats {
  firstTry: number
  firstTryTrend: number
  strong: string[]
  support: string[]
  tasksDone: number
  tasksTotal: number
  tasksTrend: number
  /** Andel oppnådde læringsmål per måned, august–juni. */
  progress: number[]
  mastery: TopicMastery[]
  pattern: Pattern
}

export interface TopicTaskResult {
  expression: string
  category: string
  level: Level
  /** Antall elever som har prøvd, og hvor mange som fikk riktig. */
  attempted: number
  correct: number
}

export interface TopicInsight {
  topic: string
  status: MasteryStatus
  /** «Trenger mer øving på» i Temaoversikt. */
  note?: string
  tasks: TopicTaskResult[]
  struggles: { expression: string; text: string }[]
  notTried: { level: Level; students: string[] }
  goingWell: string
}
