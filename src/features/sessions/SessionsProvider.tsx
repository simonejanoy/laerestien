import { useRef, useState, type ReactNode } from 'react'
import type { CalendarSession, LevelGroup, Session, SessionTask, TextTask } from '../../types'
import { describeSlots, timeSlots, weekdays, type WeekRef } from '../calendar/mockData'
import { topicDetails, unitById } from '../topics/mockData'
import { initialProgress, initialTasks, sessionBase, sessions as initialSessions } from './mockData'
import { scheduled } from './schedule'
import { evenLevels, mergeTasks, refreshStoredTasks, trimStoredTasks } from './sessionTasks'
import { browserStorage, loadTaskSets, saveTaskSets, type TaskSets } from './taskStorage'
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

/**
 * Holder styr på øktene, framdriften og oppgavene. Oppgavesettene læreren har lagret, lagres også
 * i nettleseren (se taskStorage.ts), så de er der etter omlasting. Alt annet – også elevsvar,
 * framdrift og individuelle elevforslag – ligger bare i minnet.
 */
export function SessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState(() => normalize([...initialSessions, ...scheduled.sessions]))
  const [progress, setProgress] = useState(initialProgress)
  // Lagrede oppgavesett leses én gang. Blokkert lagring eller ødelagte data gir standardoppgavene og en beskjed.
  const [stored] = useState(() => loadTaskSets(browserStorage()))
  const savedSets = useRef<TaskSets>(stored.sets)
  const [storageNotice, setStorageNotice] = useState<string | null>(stored.notice)
  const [tasks, setTasks] = useState<Record<string, SessionTask[]>>(() => {
    const full: Record<string, SessionTask[]> = { ...initialTasks, ...scheduled.tasks }
    // Oppgavene fra arbeidsarkene kommer først i øktene sine. Like oppgaver på samme nivå tas med én gang.
    for (const [sessionId, added] of Object.entries(worksheetTasks)) full[sessionId] = mergeTasks(added, full[sessionId] ?? [])
    // Like mange standardoppgaver på hvert nivå (TASKS_PER_LEVEL), også i økter med arbeidsark.
    const all = Object.fromEntries(Object.entries(full).map(([id, list]) => [id, evenLevels(list)]))
    // Oppgavesett læreren har lagret, går foran standardoppgavene. Uendrede grunnoppgaver i et eldre lagret sett får
    // svaret som rettes automatisk og inputboksene fra grunnoppgavene (se refreshStoredTasks), og standardoppgaver som
    // er tatt ut av økta, fjernes – men aldri oppgaver læreren har endret eller laget (se trimStoredTasks).
    const refreshed = Object.fromEntries(
      Object.entries(stored.sets).map(([id, set]) => [id, trimStoredTasks(refreshStoredTasks(set, full[id] ?? []), full[id] ?? [], all[id] ?? [])]),
    )
    return { ...all, ...refreshed }
  })

  /** Skriver lærerens lagrede oppgavesett til nettleseren. Bare oppgavesett – aldri elevdata. */
  const persistTaskSets = (sets: TaskSets) => {
    savedSets.current = sets
    setStorageNotice(saveTaskSets(browserStorage(), sets))
  }
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
      const week = input.week ?? at
      const session: Session = {
        ...base,
        id,
        topicId: input.topicId,
        heading: input.heading,
        description: input.description,
        year: week.year,
        week: week.week,
        slots: input.slots,
        numbers: [],
        ...describeSlots(week, input.slots),
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
            ? (() => {
                // Læreren kan flytte økta til en annen dato – også i en annen uke.
                const week = input.week ?? { year: s.year, week: s.week }
                return { ...s, year: week.year, week: week.week, heading: input.heading, description: input.description, slots: input.slots, ...describeSlots(week, input.slots) }
              })()
            : s,
        ),
      ),
    )

  const removeSession = (id: string) => {
    setSessions((prev) => normalize(prev.filter((s) => s.id !== id)))
    setTasks((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id)))
    if (id in savedSets.current) persistTaskSets(Object.fromEntries(Object.entries(savedSets.current).filter(([key]) => key !== id)))
    setProgress((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id)))
  }

  const getTasks = (sessionId: string) => tasks[sessionId] ?? []

  const saveTasks = (sessionId: string, updated: SessionTask[]) => {
    setTasks((prev) => ({ ...prev, [sessionId]: updated }))
    persistTaskSets({ ...savedSets.current, [sessionId]: updated })
  }

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
        storageNotice,
        getStudentTasks,
        addStudentTasks,
      }}
    >
      {children}
    </SessionsContext.Provider>
  )
}
