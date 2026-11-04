import type { CalendarSlot, Level, LevelGroup, Session, SessionTask, Weekday } from '../../types'
import { dateOf, describeSlots, isSameWeek, shiftWeek, weekdays, timeSlots, type WeekRef } from '../calendar/mockData'
import { isTextSpec, tasksFor, unitSpecs, type UnitSpec } from '../topics/yearPlan'
import { sessionBase, standardPlan } from './mockData'

// Legger årsplanen (se topics/curriculum.ts) inn i timeplanen for skoleåret 2026/27.
// Tall økt 1–6 ligger i uke 41–43, økt 7–10 i uke 44 (sessions/mockData.ts) og økt 11–14
// i uke 45. Hvert tidsrom fordeler øktene sine jevnt på skoleukene.

/** «tall:start» er Tall økt 1–6, «tall:slutt» er økt 11–14 (de har egne id-er, okt-5 til okt-8). */
const periods: { from: WeekRef; to: WeekRef; units: string[] }[] = [
  {
    from: { year: 2026, week: 41 },
    to: { year: 2026, week: 43 },
    units: ['tall:start'],
  },
  {
    from: { year: 2026, week: 45 },
    to: { year: 2026, week: 51 },
    units: ['tall:slutt', 'multiplikasjon', 'divisjon', 'repetisjon-host'],
  },
  {
    from: { year: 2027, week: 1 },
    to: { year: 2027, week: 13 },
    units: ['geometri', 'problemlosing', 'tall-og-regning', 'repetisjon-vinter'],
  },
  {
    from: { year: 2027, week: 14 },
    to: { year: 2027, week: 24 },
    units: ['strategier-i-divisjon', 'maling', 'monster-og-algoritmer', 'regning', 'repetisjon-var'],
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

/** Økt nr. `n` (0, 1, 2 …) i en periode som skal inn i timeplanen. */
interface Planned {
  id: string
  spec: UnitSpec
  heading: string
  skills: string[]
  n: number
}

function planned(key: string): Planned[] {
  const [unitId, part] = key.split(':')
  const spec = unitSpecs.find((u) => u.unitId === unitId)
  if (!spec) return []
  const all = spec.weeks
    .flatMap((w) => w.sessions)
    .map(({ heading, skills }, n) => ({ id: `${unitId}-${n + 1}`, spec, heading, skills, n }))
  if (part === 'start') return all.slice(0, 6)
  // Tall økt 11–14 har id-ene okt-5 til okt-8 fra før (økt 7–10 er okt-1-2, okt-3 og okt-4).
  if (part === 'slutt') return all.slice(10).map((p, i) => ({ ...p, id: `okt-${i + 5}` }))
  return all
}

/** Seks elever på hvert nivå i 4A. */
const STUDENTS_PER_LEVEL = 6

function buildSession({ id, spec, heading, skills }: Planned, at: WeekRef, slot: CalendarSlot): Session {
  const levels: LevelGroup[] = spec.levels.map((l, i) => ({
    level: (i + 1) as Level,
    ...l,
    taskCount: 5,
    studentCount: STUDENTS_PER_LEVEL,
  }))
  return {
    id,
    topicId: spec.unitId,
    title: spec.title,
    heading,
    description: spec.description,
    topic: spec.topic,
    area: spec.area,
    className: sessionBase.className,
    ...describeSlots(at, [slot]),
    ...at,
    slots: [slot],
    skillIds: skills,
    // Nummer og antall økter regnes ut i SessionsProvider.
    numbers: [],
    totalSessions: 0,
    levels,
    goals: spec.goals.slice(0, 3),
    plan: standardPlan,
  }
}

function buildTasks({ id, skills, n }: Planned): SessionTask[] {
  return ([1, 2, 3] as const).flatMap((level) =>
    tasksFor(skills, level, n).map((task, i): SessionTask => {
      const taskId = `${id}-n${level}-${i + 1}`
      if (isTextSpec(task)) {
        return { kind: 'text', id: taskId, level, text: task.text, solution: task.solution, competenceGoal: '', adaptation: '', aiGenerated: false, reviewed: false }
      }
      const [type, a, operator, b, instruction] = task
      return { id: taskId, level, type, instruction, a, operator, b }
    }),
  )
}

function buildSchedule() {
  const sessions: Session[] = []
  const tasks: Record<string, SessionTask[]> = {}

  for (const period of periods) {
    const queue = period.units.flatMap(planned)
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

/** Øktene og oppgavene i årsplanen som ikke ligger i uke 44. */
export const scheduled = buildSchedule()
