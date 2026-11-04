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
  totalSessions: number
  levels: LevelGroup[]
  goals: string[]
  plan: PlanItem[]
}

/** completed/skipped lagres; available/locked regnes ut fra rekkefølgen. */
export type SessionStatus = 'completed' | 'skipped' | 'available' | 'locked'

export type TaskType = 'Hoderegning' | 'Oppstilling'

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
}

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
}

export type SessionTask = Task | TextTask

export interface Topic {
  id: string
  name: string
  weeks: number
}

export interface PlanWeek {
  title: string
  /** Øktene i uka, i rekkefølge. Økt-nummeret er posisjonen i hele temaet. */
  sessions: string[]
}

/** Utfyllende innhold for et tema (foreløpig bare Addisjon og subtraksjon). */
export interface TopicDetails {
  topicId: string
  weeks: PlanWeek[]
  goals: string[]
}

export interface Term {
  id: 'host' | 'vinter' | 'var'
  name: string
  period: string
  topics: Topic[]
}

export interface Student {
  id: string
  name: string
  level: Level
  /** Bilde av eleven (valgfritt). */
  photo?: string
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
  tasks: TopicTaskResult[]
  struggles: { expression: string; text: string }[]
  notTried: { level: Level; students: string[] }
  goingWell: string
}
