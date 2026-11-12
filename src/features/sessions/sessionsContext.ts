import { createContext, useContext } from 'react'
import type { CalendarSession, CalendarSlot, Session, SessionStatus, SessionTask, TextTask } from '../../types'
import type { WeekRef } from '../calendar/mockData'

/** Det læreren fyller inn når en økt lages eller endres. */
export interface SessionInput {
  topicId: string
  heading: string
  description: string
  slots: CalendarSlot[]
  /** Uka datoen læreren valgte ligger i. Uten den blir økta i uka den legges til i (eller allerede har). */
  week?: WeekRef
}

export interface SessionsContextValue {
  sessions: Session[]
  /** Lappene i kalenderen, regnet ut fra øktene. */
  calendarEntries: CalendarSession[]
  getStatus: (id: string) => SessionStatus
  /** Tidligere økter som verken er gjennomført eller hoppet over. */
  getBlockers: (id: string) => Session[]
  skip: (ids: string[]) => void
  complete: (id: string) => void
  /** Lager en ny økt i uka `at`. */
  addSession: (input: SessionInput, at: WeekRef) => string
  updateSession: (id: string, input: SessionInput) => void
  removeSession: (id: string) => void
  getTasks: (sessionId: string) => SessionTask[]
  saveTasks: (sessionId: string, tasks: SessionTask[]) => void
  /** Beskjed til læreren når oppgavene ikke kan lagres i eller leses fra nettleseren, ellers null. */
  storageNotice: string | null
  /** Individuelle oppgaver læreren har lagt til for en elev. */
  getStudentTasks: (studentId: string) => TextTask[]
  addStudentTasks: (studentId: string, tasks: TextTask[]) => void
}

export const SessionsContext = createContext<SessionsContextValue | null>(null)

export function useSessions() {
  const context = useContext(SessionsContext)
  if (!context) throw new Error('useSessions må brukes inne i <SessionsProvider>')
  return context
}

export function sessionLabel(session: Session) {
  return session.numbers.join(' & ')
}
