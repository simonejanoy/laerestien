import { useState, type ReactNode } from 'react'
import { initialProgress, initialTasks, sessions } from './mockData'
import { SessionsContext } from './sessionsContext'

/** Holder styr på framdrift og oppgaver per økt (byttes til Firestore senere). */
export function SessionsProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState(initialProgress)
  const [tasks, setTasks] = useState(initialTasks)

  const getBlockers = (id: string) => {
    const index = sessions.findIndex((s) => s.id === id)
    return sessions.slice(0, Math.max(index, 0)).filter((s) => !progress[s.id])
  }

  const getStatus = (id: string) => {
    if (progress[id]) return progress[id]
    return getBlockers(id).length > 0 ? 'locked' : 'available'
  }

  const skip = (ids: string[]) =>
    setProgress((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, 'skipped'])) }))

  const complete = (id: string) => setProgress((prev) => ({ ...prev, [id]: 'completed' }))

  const getTasks = (sessionId: string) => tasks[sessionId] ?? []

  const saveTasks = (sessionId: string, updated: typeof tasks[string]) =>
    setTasks((prev) => ({ ...prev, [sessionId]: updated }))

  return (
    <SessionsContext.Provider value={{ sessions, getStatus, getBlockers, skip, complete, getTasks, saveTasks }}>
      {children}
    </SessionsContext.Provider>
  )
}
