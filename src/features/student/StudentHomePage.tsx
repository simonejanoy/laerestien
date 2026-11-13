import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { subscribeLiveSession, type LiveSession } from '../../lib/liveSession'
import { sessionLabel, useSessions } from '../sessions/sessionsContext'
import { Greeting, MessageCard, PausedScreen } from './StatusScreens'
import { StudentLayout } from './StudentLayout'
import { StudentTaskFlow } from './StudentTaskFlow'
import { answerRecord } from '../repetition/answers'
import { saveAnswer } from '../../lib/results'
import { verbFor, type TaskResultSummary } from './studentTasks'
import type { SessionTask } from '../../types'

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

  const verb = verbFor(tasks)

  // Ferdig rettet oppgave: lagres anonymt (undertema, nivå, riktig/galt og forsøk) til repetisjonen.
  const saveResult = (task: SessionTask, result: TaskResultSummary) => {
    const record = session && profile && answerRecord(profile.uid, session, task, result)
    if (record) void saveAnswer(classId, record)
  }

  return (
    <StudentLayout label={label} onLogout={logout}>
      <Greeting text={session ? `Hei, ${firstName}! ${verb}` : `Hei, ${firstName}!`} />
      {failed ? (
        <MessageCard title="Fikk ikke kontakt" text="Sjekk at du er koblet til nettet, og prøv igjen om litt." />
      ) : live === undefined ? (
        <MessageCard title="Kobler til …" />
      ) : !session ? (
        <MessageCard title="Venter på læreren" text="Oppgavene dukker opp her når læreren starter økta." />
      ) : (
        <StudentTaskFlow tasks={tasks} index={index} onNext={() => setIndex(index + 1)} topicId={session.topicId} onResult={saveResult} />
      )}
    </StudentLayout>
  )
}
