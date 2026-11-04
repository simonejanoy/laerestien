import type { CalendarSlot, Level, LevelGroup, Session, Task, Weekday } from '../../types'
import { dateOf, describeSlots, isSameWeek, shiftWeek, weekdays, timeSlots, type WeekRef } from '../calendar/mockData'
import { topicDetails } from '../topics/mockData'
import { additionRest, yearPlan, type TopicSpec } from '../topics/yearPlan'
import { sessionBase, standardPlan } from './mockData'

// Legger resten av årsplanen inn i timeplanen, fra uke 45 og ut skoleåret 2026/27.
// Hver periode har sitt eget tidsrom, og øktene fordeles jevnt på skoleukene der.

const periods: { from: WeekRef; to: WeekRef; topics: string[] }[] = [
  {
    from: { year: 2026, week: 45 },
    to: { year: 2026, week: 51 },
    topics: ['addisjon-og-subtraksjon', 'multiplikasjon', 'deling', 'repetisjon-host'],
  },
  {
    from: { year: 2027, week: 1 },
    to: { year: 2027, week: 13 },
    topics: ['divisjon', 'figurer-og-vinkler', 'romfigurer', 'brok', 'repetisjon-vinter'],
  },
  {
    from: { year: 2027, week: 14 },
    to: { year: 2027, week: 24 },
    topics: ['klokke-og-tid', 'penger-og-handel', 'statistikk', 'monstre-og-logikk', 'repetisjon-var'],
  },
]

/** Ferieuker (vinterferie og påske) – juleferien ligger mellom periodene. */
const holidayWeeks: WeekRef[] = [
  { year: 2027, week: 9 },
  { year: 2027, week: 12 },
]

/** Fridager: 2. påskedag, Kristi himmelfartsdag og 17. mai. */
const freeDays = ['2027-03-29', '2027-05-06', '2027-05-17']

/** Timene øktene legges i, i den rekkefølgen de tas i bruk. */
const preferredSlots: CalendarSlot[] = [
  { day: 'Mandag', time: '08.30' },
  { day: 'Onsdag', time: '10.30' },
  { day: 'Fredag', time: '09.30' },
  { day: 'Tirsdag', time: '08.30' },
  { day: 'Torsdag', time: '10.30' },
  { day: 'Mandag', time: '12.15' },
  { day: 'Onsdag', time: '12.15' },
]

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const isFreeDay = (at: WeekRef, day: Weekday) => freeDays.includes(isoDate(dateOf(at, day)))

function schoolWeeks(from: WeekRef, to: WeekRef) {
  const weeks: WeekRef[] = []
  for (let at = from; ; at = shiftWeek(at, 1)) {
    if (!holidayWeeks.some((h) => isSameWeek(h, at))) weeks.push(at)
    if (isSameWeek(at, to)) return weeks
  }
}

const slotIndex = (slot: CalendarSlot) => weekdays.indexOf(slot.day) * 100 + timeSlots.indexOf(slot.time)

/** Økt nr. `n` (0, 1, 2 …) i et tema som skal inn i timeplanen. */
interface Planned {
  id: string
  spec: Pick<TopicSpec, 'topicId' | 'title' | 'topic' | 'area' | 'description' | 'goals' | 'levels' | 'tasks'>
  heading: string
  n: number
}

/** Økt 5–8 i Addisjon og subtraksjon – økt 1–4 ligger allerede i uke 44. */
function plannedAddition(): Planned[] {
  const details = topicDetails.find((d) => d.topicId === 'addisjon-og-subtraksjon')
  const headings = details?.weeks.flatMap((w) => w.sessions).slice(4) ?? []
  const spec = {
    ...additionRest,
    topicId: sessionBase.topicId,
    title: sessionBase.title,
    topic: sessionBase.topic,
    area: sessionBase.area,
    goals: details?.goals ?? [],
  }
  return headings.map((heading, n) => ({ id: `okt-${n + 5}`, spec, heading, n }))
}

function planned(topicId: string): Planned[] {
  if (topicId === 'addisjon-og-subtraksjon') return plannedAddition()
  const spec = yearPlan.find((t) => t.topicId === topicId)
  if (!spec) return []
  return spec.weeks
    .flatMap((w) => w.sessions)
    .map((heading, n) => ({ id: `${topicId}-${n + 1}`, spec, heading, n }))
}

/** Seks elever på hvert nivå i 4A. */
const STUDENTS_PER_LEVEL = 6

function buildSession({ id, spec, heading }: Planned, at: WeekRef, slot: CalendarSlot): Session {
  const levels: LevelGroup[] = spec.levels.map((l, i) => ({
    level: (i + 1) as Level,
    ...l,
    taskCount: 5,
    studentCount: STUDENTS_PER_LEVEL,
  }))
  return {
    id,
    topicId: spec.topicId,
    title: spec.title,
    heading,
    description: spec.description,
    topic: spec.topic,
    area: spec.area,
    className: sessionBase.className,
    ...describeSlots(at, [slot]),
    ...at,
    slots: [slot],
    // Nummer og antall økter regnes ut i SessionsProvider.
    numbers: [],
    totalSessions: 0,
    levels,
    goals: spec.goals.slice(0, 3),
    plan: standardPlan,
  }
}

function buildTasks({ id, spec, n }: Planned): Task[] {
  return ([1, 2, 3] as const).flatMap((level) =>
    spec.tasks(level, n).map(([type, a, operator, b, instruction], i) => ({
      id: `${id}-n${level}-${i + 1}`,
      level,
      type,
      instruction,
      a,
      operator,
      b,
    })),
  )
}

function buildSchedule() {
  const sessions: Session[] = []
  const tasks: Record<string, Task[]> = {}

  for (const period of periods) {
    const queue = period.topics.flatMap(planned)
    const weeks = schoolWeeks(period.from, period.to)
    // Jevn fordeling: de første ukene får én økt ekstra når det ikke går opp.
    const base = Math.floor(queue.length / weeks.length)
    const extra = queue.length % weeks.length

    weeks.forEach((at, w) => {
      const count = base + (w < extra ? 1 : 0)
      const slots = preferredSlots
        .filter((slot) => !isFreeDay(at, slot.day))
        .slice(0, count)
        .sort((a, b) => slotIndex(a) - slotIndex(b))
      for (const slot of slots) {
        const next = queue.shift()
        if (!next) return
        sessions.push(buildSession(next, at, slot))
        tasks[next.id] = buildTasks(next)
      }
    })
  }

  return { sessions, tasks }
}

/** Øktene og oppgavene fra uke 45 og ut skoleåret. */
export const scheduled = buildSchedule()
