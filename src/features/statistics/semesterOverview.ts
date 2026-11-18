import type { Session, TopicInsight, TopicMastery, Weekday } from '../../types/index.ts'
import { classTopics, masteryOf, topicInsights } from './mockData.ts'

// Temaoversikten på Statistikk. Temaene er de samme som før (classTopics i mockData.ts); bare innholdet i hvert tema
// simuleres ut fra hvor langt klassen har kommet i høstsemesteret: framdrift, hvilke økter som er gjennomført, pågår eller
// kommer, og hva klassen bør øve mer på. Finnes det oppgavedata for temaet (topicInsights), brukes de. Den simulerte
// mestringen ligger bare her – den lagres ikke, og påvirker ikke resultater, framdrift eller den øvrige statistikken.
// Rene funksjoner (ingen React), så de kan testes i Node. Importene har .ts-endelse.

export interface Today {
  year: number
  week: number
  day: Weekday
}

/** Prototypen vises i uke 47 i høstsemesteret 2026 (onsdag 18. november). */
export const DEMO_TODAY: Today = { year: 2026, week: 47, day: 'Onsdag' }

const DAYS: Weekday[] = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag']

export type Phase = 'done' | 'current' | 'upcoming'

export interface SemesterSession {
  id: string
  label: string
  /** «Uke 48», eller «Uke 2 (våren)» for økter etter jul. */
  when: string
  phase: Phase
}

export interface SemesterTopic {
  topic: string
  phase: Phase
  sessions: SemesterSession[]
  /** Raden i Temaoversikt. */
  row: TopicMastery
  /** Detaljene når læreren velger temaet (null for temaer klassen ikke har begynt på). */
  insight: TopicInsight | null
}

/**
 * Hvilket tema (fagområde) en økt hører til. Tall og plassverdi er delt: plassverdi og negative tall er
 * Tallforståelse, addisjon og subtraksjon er Regning. Repetisjonsøktene følger innholdet sitt.
 */
const AREA_BY_SESSION: Record<string, string> = {
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`tall-${n}`, 'Tallforståelse'])),
  'okt-8': 'Tallforståelse',
  'repetisjon-host-1': 'Tallforståelse',
  'repetisjon-host-5': 'Problemløsning',
}
const AREA_BY_UNIT: Record<string, string> = {
  tall: 'Regning',
  multiplikasjon: 'Regning',
  divisjon: 'Regning',
  'repetisjon-host': 'Regning',
  geometri: 'Geometri',
  problemlosing: 'Problemløsning',
  'tall-og-regning': 'Regning',
  'repetisjon-vinter': 'Regning',
  'strategier-i-divisjon': 'Regning',
  maling: 'Måling',
  'monster-og-algoritmer': 'Mønstre',
  regning: 'Regning',
  'repetisjon-var': 'Regning',
}

export const areaOf = (s: Pick<Session, 'id' | 'topicId'>) => AREA_BY_SESSION[s.id] ?? AREA_BY_UNIT[s.topicId]

/** Simulert mestring og grunnlag for temaene klassen har jobbet med i høst, når det ikke finnes oppgavedata. */
const simulated: Record<string, { status: TopicMastery['status']; filled: number; practice: string; insight: Omit<TopicInsight, 'topic' | 'status' | 'note'> }> = {
  Tallforståelse: {
    status: 'understanding',
    filled: 6,
    practice: 'Firesifrede tall',
    insight: {
      tasks: [
        { expression: 'Hvor mange tiere og enere er det i 47?', category: 'Plassverdi', level: 1, attempted: 18, correct: 17 },
        { expression: 'Hvilket tall er størst, 6 159 eller 6 519?', category: 'Større enn og mindre enn', level: 2, attempted: 17, correct: 15 },
        { expression: '10 mer enn 296 =', category: 'Tallmønstre', level: 2, attempted: 16, correct: 13 },
        { expression: 'Del opp 8 372 i tusenere, hundrere, tiere og enere', category: 'Firesifrede tall', level: 3, attempted: 10, correct: 6 },
        { expression: '−3 + 5 =', category: 'Negative tall', level: 3, attempted: 8, correct: 6 },
      ],
      struggles: [
        { expression: 'Del opp 8 372 …', text: '6 av 10 riktig · null på en plass' },
        { expression: '10 mer enn 296 =', text: '13 av 16 riktig · tieroverganger over hundre' },
      ],
      notTried: { level: 3, students: ['Sofie L.', 'Emil H.', 'Isak J.'] },
      goingWell: 'Nesten alle kan plassverdi med tiere og enere, og sammenligne tall.',
    },
  },
}

const DONE_PRACTICE: Record<string, string> = { Regning: '7-, 8- og 9-gangen' }

const order = (s: Pick<Session, 'year' | 'week' | 'slots'>) => (s.year * 100 + s.week) * 10 + DAYS.indexOf(s.slots[0]?.day ?? 'Mandag')
const todayOrder = (t: Today) => (t.year * 100 + t.week) * 10 + DAYS.indexOf(t.day)
const weekText = (s: Pick<Session, 'year' | 'week'>, today: Today) => `Uke ${s.week}${s.year > today.year ? ' (våren)' : ''}`

/**
 * Temaoversikten for høstsemesteret, med de samme temaene som før. For hvert tema: øktene i årsplanen og om de er
 * gjennomført, pågår (denne uka) eller kommer. Mestringen kommer fra oppgavedataene når de finnes, ellers er den simulert
 * for temaer klassen har jobbet med. Temaer klassen ikke har begynt på, viser når de starter.
 */
export function semesterOverview(sessions: Session[], today: Today = DEMO_TODAY): SemesterTopic[] {
  const now = todayOrder(today)
  const sorted = [...sessions].sort((a, b) => order(a) - order(b))

  return classTopics.map((topic): SemesterTopic => {
    const list = sorted.filter((s) => areaOf(s) === topic)
    const topicSessions = list.map(
      (s): SemesterSession => ({
        id: s.id,
        label: `${s.title} økt ${s.numbers.length ? s.numbers.join('–') : ''}: ${s.heading}`.replace(' økt :', ':'),
        when: weekText(s, today),
        phase: order(s) < now ? 'done' : s.week === today.week && s.year === today.year ? 'current' : 'upcoming',
      }),
    )
    const done = topicSessions.filter((s) => s.phase === 'done').length
    const thisWeek = topicSessions.filter((s) => s.phase === 'current')
    const next = topicSessions.find((s) => s.phase !== 'done')
    // Pågår: økter denne uka. Gjennomført: alle høstens økter før i dag er tatt (resten kommer senere, f.eks. repetisjon).
    const phase: Phase = thisWeek.length > 0 ? 'current' : done > 0 ? 'done' : 'upcoming'

    const data = topicInsights.find((t) => t.topic === topic)
    const sim = simulated[topic]
    if (phase === 'upcoming') {
      const note = next ? `Starter ${next.when.toLowerCase()} · ${topicSessions.length} økter i årsplanen` : 'Ikke i årsplanen ennå'
      return { topic, phase, sessions: topicSessions, row: { topic, status: 'insufficient', filled: 0, label: 'Kommer', note }, insight: null }
    }

    // Oppgavedata går foran det simulerte.
    const real = data ? masteryOf(topic, data) : null
    const status = real?.status ?? sim?.status ?? 'understanding'
    const filled = real?.filled ?? sim?.filled ?? 5
    const practice = (real?.note ?? sim?.practice ?? DONE_PRACTICE[topic] ?? 'Repetere temaet').toLowerCase()
    const current = thisWeek[0]?.label.replace(/^.*?: /, '')
    const progress =
      phase === 'current'
        ? `${done} økter gjennomført · nå: ${current}`
        : `${done} økter gjennomført${next ? ` · neste ${next.when.toLowerCase()}` : ''}`
    const row: TopicMastery = { topic, status, filled, label: phase === 'current' ? 'Pågår nå' : 'Gjennomført', note: `${progress} · øv mer på ${practice}` }
    const insight = data ?? (sim ? { topic, status: sim.status, note: sim.practice, ...sim.insight } : null)
    return { topic, phase, sessions: topicSessions, row, insight }
  })
}
