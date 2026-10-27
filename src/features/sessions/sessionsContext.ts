import { createContext, useContext } from 'react'
import type { CalendarSession, CalendarSlot, Session, SessionStatus, Task } from '../../types'

/** Det læreren fyller inn når en økt lages eller endres. */
export interface SessionInput {
  topicId: string
  heading: string
  description: string
  slots: CalendarSlot[]
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
  addSession: (input: SessionInput) => string
  updateSession: (id: string, input: SessionInput) => void
  removeSession: (id: string) => void
  getTasks: (sessionId: string) => Task[]
  saveTasks: (sessionId: string, tasks: Task[]) => void
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
