import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import type { Operator } from '../../types'
import { subscribeLiveSession, type LiveSession } from '../../lib/liveSession'
import { sessionLabel, useSessions } from '../sessions/sessionsContext'
import { Greeting, MessageCard, PausedScreen } from './StatusScreens'
import { StudentLayout } from './StudentLayout'
import { TaskScreen } from './TaskScreen'
import { TextTaskScreen } from './TextTaskScreen'

/** Hvor langt eleven har kommet, lagret i nettleseren så eleven fortsetter der hen slapp. */
function useSavedIndex(key: string | null) {
  const read = () => {
    if (!key) return 0
    try {
      return Number(localStorage.getItem(key) ?? 0) || 0
    } catch {
      return 0
    }
  }
  const [state, setState] = useState(() => ({ key, index: read() }))

  // Ny økt: les lagret framdrift for den.
  if (state.key !== key) setState({ key, index: read() })

  const setIndex = (index: number) => {
    setState({ key, index })
    if (!key) return
    try {
      localStorage.setItem(key, String(index))
    } catch {
      // Ikke kritisk – framdriften lagres bare ikke mellom besøk.
    }
  }
  return [state.index, setIndex] as const
}

/** «Vi legger sammen» osv. – ut fra regneartene i økta. */
function verbFor(ops: Operator[]) {
  if (ops.length === 0) return 'Nå setter vi i gang'
  if (ops.includes('/')) return 'Vi deler'
  if (ops.includes('*')) return 'Vi ganger'
  if (ops.includes('-')) return 'Vi trekker fra'
  return 'Vi legger sammen'
}

export function StudentHomePage() {
  const { profile, logout } = useAuth()
  const { sessions, getTasks } = useSessions()
  const classId = profile?.classId ?? '4A'
  const level = profile?.level ?? 1
  const firstName = profile?.name.split(' ')[0] ?? ''

  // undefined = kobler til, null = ingen økt i gang.
  const [live, setLive] = useState<LiveSession | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)

  useEffect(
    () =>
      subscribeLiveSession(
        classId,
        (session) => {
          setFailed(false)
          setLive(session)
        },
        () => setFailed(true),
      ),
    [classId],
  )

  const session = live ? sessions.find((s) => s.id === live.sessionId) : undefined
  const tasks = session ? getTasks(session.id).filter((t) => t.level === level) : []
  const [index, setIndex] = useSavedIndex(session && profile ? `laerestien:fremdrift:${profile.uid}:${session.id}` : null)

  const label = session ? `${session.title} økt ${sessionLabel(session)}` : undefined

  if (live?.status === 'paused') {
    return (
      <StudentLayout label={label} background="board" onLogout={logout}>
        <PausedScreen />
      </StudentLayout>
    )
  }

  const task = tasks[index]
  const verb = verbFor(tasks.flatMap((t) => (t.kind === 'text' ? [] : [t.operator])))

  return (
    <StudentLayout label={label} onLogout={logout}>
      <Greeting text={session ? `Hei, ${firstName}! ${verb}` : `Hei, ${firstName}!`} />
      {failed ? (
        <MessageCard title="Fikk ikke kontakt" text="Sjekk at du er koblet til nettet, og prøv igjen om litt." />
      ) : live === undefined ? (
        <MessageCard title="Kobler til …" />
      ) : !session ? (
        <MessageCard title="Venter på læreren" text="Oppgavene dukker opp her når læreren starter økta." />
      ) : !task ? (
        <MessageCard title="Bra jobba!" text="Du har gjort alle oppgavene i denne økta." />
      ) : (
        <div className="px-20 pb-12">
          {task.kind === 'text' ? (
            <TextTaskScreen key={task.id} task={task} index={index} total={tasks.length} onNext={() => setIndex(index + 1)} />
          ) : (
            <TaskScreen key={task.id} task={task} index={index} total={tasks.length} onNext={() => setIndex(index + 1)} />
          )}
        </div>
      )}
    </StudentLayout>
  )
}
