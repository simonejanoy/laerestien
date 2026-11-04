import { useState, type ReactNode } from 'react'
import type { CalendarSession, LevelGroup, Session, SessionTask, TextTask } from '../../types'
import { describeSlots, timeSlots, weekdays, type WeekRef } from '../calendar/mockData'
import { topicDetails, unitById } from '../topics/mockData'
import { initialProgress, initialTasks, sessionBase, sessions as initialSessions } from './mockData'
import { scheduled } from './schedule'
import { worksheetTasks } from './worksheetTasks'
import { SessionsContext, type SessionInput } from './sessionsContext'

const slotOrder = (s: Session) => {
  const first = s.slots[0]
  return (s.year * 100 + s.week) * 1000 + weekdays.indexOf(first.day) * 100 + timeSlots.indexOf(first.time)
}

/** Sorterer øktene etter timeplanen og nummererer dem fortløpende per tema. */
function normalize(list: Session[]): Session[] {
  const sorted = [...list].sort((a, b) => slotOrder(a) - slotOrder(b))
  const counters: Record<string, number> = {}
  const numbered = sorted.map((s) => {
    const start = counters[s.topicId] ?? 0
    counters[s.topicId] = start + s.slots.length
    return { ...s, numbers: s.slots.map((_, i) => start + i + 1) }
  })
  return numbered.map((s) => {
    const planned =
      topicDetails.find((d) => d.topicId === s.topicId)?.weeks.reduce((n, w) => n + w.sessions.length, 0) ?? 0
    return { ...s, totalSessions: Math.max(planned, counters[s.topicId]) }
  })
}

const emptyLevels: LevelGroup[] = ([1, 2, 3] as const).map((level) => ({
  level,
  title: `Oppgaver på nivå ${level}`,
  subtitle: 'Ingen oppgaver ennå.',
  description: 'Legg til oppgaver under «Rediger oppgavene».',
  taskCount: 0,
  studentCount: 0,
}))

/** Holder styr på øktene, framdriften og oppgavene (bare i minnet foreløpig). */
export function SessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState(() => normalize([...initialSessions, ...scheduled.sessions]))
  const [progress, setProgress] = useState(initialProgress)
  const [tasks, setTasks] = useState<Record<string, SessionTask[]>>(() => {
    const all: Record<string, SessionTask[]> = { ...initialTasks, ...scheduled.tasks }
    // Oppgavene fra arbeidsarkene kommer først i øktene sine.
    for (const [sessionId, added] of Object.entries(worksheetTasks)) all[sessionId] = [...added, ...(all[sessionId] ?? [])]
    return all
  })
  const [studentTasks, setStudentTasks] = useState<Record<string, TextTask[]>>({})

  const calendarEntries: CalendarSession[] = sessions.flatMap((s) =>
    s.slots.map((slot, i) => ({
      id: `${s.id}-${i}`,
      sessionId: s.id,
      topic: s.topic,
      sessionNumber: s.numbers[i],
      day: slot.day,
      time: slot.time,
      year: s.year,
      week: s.week,
    })),
  )

  const getBlockers = (id: string) => {
    const session = sessions.find((s) => s.id === id)
    if (!session) return []
    const sameTopic = sessions.filter((s) => s.topicId === session.topicId)
    return sameTopic.slice(0, sameTopic.indexOf(session)).filter((s) => !progress[s.id])
  }

  const getStatus = (id: string) => {
    if (progress[id]) return progress[id]
    return getBlockers(id).length > 0 ? 'locked' : 'available'
  }

  const skip = (ids: string[]) =>
    setProgress((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, 'skipped'])) }))

  const complete = (id: string) => setProgress((prev) => ({ ...prev, [id]: 'completed' }))

  const addSession = (input: SessionInput, at: WeekRef) => {
    const id = `okt-${Date.now()}`
    setSessions((prev) => {
      // Ny økt arver tittel, fagområde osv. fra andre økter i samme tema.
      const sibling = prev.find((s) => s.topicId === input.topicId)
      const topicName = unitById(input.topicId)?.name ?? ''
      const base = sibling
        ? { ...sessionBase, title: sibling.title, topic: sibling.topic, area: sibling.area, className: sibling.className }
        : { ...sessionBase, title: topicName, topic: topicName, area: 'Matematikk' }
      const session: Session = {
        ...base,
        id,
        topicId: input.topicId,
        heading: input.heading,
        description: input.description,
        ...at,
        slots: input.slots,
        numbers: [],
        ...describeSlots(at, input.slots),
        levels: emptyLevels,
        goals: [],
      }
      return normalize([...prev, session])
    })
    return id
  }

  const updateSession = (id: string, input: SessionInput) =>
    setSessions((prev) =>
      normalize(
        prev.map((s) =>
          s.id === id
            ? { ...s, heading: input.heading, description: input.description, slots: input.slots, ...describeSlots(s, input.slots) }
            : s,
        ),
      ),
    )

  const removeSession = (id: string) => {
    setSessions((prev) => normalize(prev.filter((s) => s.id !== id)))
    setTasks((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id)))
    setProgress((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id)))
  }

  const getTasks = (sessionId: string) => tasks[sessionId] ?? []

  const saveTasks = (sessionId: string, updated: SessionTask[]) =>
    setTasks((prev) => ({ ...prev, [sessionId]: updated }))

  const getStudentTasks = (studentId: string) => studentTasks[studentId] ?? []

  const addStudentTasks = (studentId: string, added: TextTask[]) =>
    setStudentTasks((prev) => ({ ...prev, [studentId]: [...(prev[studentId] ?? []), ...added] }))

  return (
    <SessionsContext.Provider
      value={{
        sessions,
        calendarEntries,
        getStatus,
        getBlockers,
        skip,
        complete,
        addSession,
        updateSession,
        removeSession,
        getTasks,
        saveTasks,
        getStudentTasks,
        addStudentTasks,
      }}
    >
      {children}
    </SessionsContext.Provider>
  )
}
