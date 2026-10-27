import { createContext, useContext } from 'react'
import type { Session, SessionStatus, Task } from '../../types'

export interface SessionsContextValue {
  sessions: Session[]
  getStatus: (id: string) => SessionStatus
  /** Tidligere økter som verken er gjennomført eller hoppet over. */
  getBlockers: (id: string) => Session[]
  skip: (ids: string[]) => void
  complete: (id: string) => void
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
