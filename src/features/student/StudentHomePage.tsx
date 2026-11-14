import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import type { SessionTask } from '../../types'
import { roster } from '../class/roster'
import { useLiveBackend } from '../live/liveBackend'
import {
  answersKey,
  canDeliver,
  deliveryOf,
  loadRun,
  runIdOf,
  saveRun,
  studentLevel,
  studentViewState,
  type SavedRun,
} from '../live/liveProgress'
import { useLiveSession } from '../live/useLiveSession'
import { answerRecord } from '../repetition/answers'
import { sessionLabel, useSessions } from '../sessions/sessionsContext'
import { browserStorage } from '../sessions/taskStorage'
import { Greeting, MessageCard, PausedScreen } from './StatusScreens'
import { StudentLayout } from './StudentLayout'
import { StudentTaskFlow } from './StudentTaskFlow'
import { verbFor, type TaskAnswerState, type TaskResultSummary } from './studentTasks'

/**
 * Elevens svar og hvor eleven er i økta, lagret i nettleseren per gjennomføring (run). De er der etter omlasting og
 * etter ny innlogging i samme nettleser. En ny gjennomføring av økta har egen nøkkel og starter tom.
 */
function useSavedRun(key: string | null) {
  const read = () => (key ? loadRun(browserStorage(), key) : { index: 0, answers: {} })
  const [state, setState] = useState(() => ({ key, run: read() }))

  // Ny gjennomføring: les det som er lagret for den.
  if (state.key !== key) setState({ key, run: read() })

  const setRun = (run: SavedRun) => {
    setState({ key, run })
    if (key) saveRun(browserStorage(), key, run)
  }
  return [state.key === key ? state.run : read(), setRun] as const
}

export function StudentHomePage() {
  const { profile, logout } = useAuth()
  const backend = useLiveBackend()
  const { sessions, getTasks } = useSessions()
  const classId = profile?.classId ?? '4A'
  const level = studentLevel(profile, roster)
  const firstName = profile?.name.split(' ')[0] ?? ''

  // live: undefined = kobler til, null = ingen økt startet.
  const { live, failed } = useLiveSession(classId)
  const session = live ? sessions.find((s) => s.id === live.sessionId) : undefined
  const tasks = session ? getTasks(session.id).filter((t) => t.level === level) : []
  const runId = live && session ? runIdOf(live) : null
  const [run, setRun] = useSavedRun(runId && profile ? answersKey(profile.uid, runId) : null)
  const [sendFailed, setSendFailed] = useState(false)

  const label = session ? `${session.title} økt ${sessionLabel(session)}` : undefined
  const view = studentViewState(live, !!session, failed)

  if (view === 'paused') {
    return (
      <StudentLayout label={label} background="board" onLogout={logout}>
        <PausedScreen />
      </StudentLayout>
    )
  }

  const done = tasks.map((t) => deliveryOf(run.answers[t.id]) !== null)
  const doneCount = done.filter(Boolean).length
  const index = Math.min(run.index, tasks.length)
  const goTo = (next: number) => setRun({ ...run, index: Math.max(0, Math.min(next, tasks.length)) })

  // Ferdig rettet oppgave: lagres anonymt (undertema, nivå, riktig/galt og forsøk) til repetisjonen.
  const saveResult = (task: SessionTask, result: TaskResultSummary) => {
    const record = session && profile && answerRecord(profile.uid, session, task, result)
    if (record) void backend.saveAnswer(classId, record)
  }

  // Et svar er endret. Når oppgaven blir levert, får læreren beskjed (bare mens økta er i gang).
  const answer = (taskId: string, state: TaskAnswerState) => {
    const delivery = !deliveryOf(run.answers[taskId]) ? deliveryOf(state) : null
    if (delivery && profile && session && runId && canDeliver(live, runId)) {
      void backend
        .saveDelivery(classId, { studentId: profile.uid, runId, sessionId: session.id, level, total: tasks.length }, taskId, delivery)
        .then((ok) => setSendFailed(!ok))
    }
    setRun({ ...run, answers: { ...run.answers, [taskId]: state } })
  }

  const greeting = view === 'tasks' ? `Hei, ${firstName}! ${verbFor(tasks)}` : `Hei, ${firstName}!`
  const firstOpen = done.indexOf(false)

  return (
    <StudentLayout label={label} onLogout={logout}>
      <Greeting text={greeting} />
      {view === 'failed' ? (
        <MessageCard title="Fikk ikke kontakt" text="Sjekk at du er koblet til nettet, og prøv igjen om litt." />
      ) : view === 'connecting' ? (
        <MessageCard title="Kobler til …" />
      ) : view === 'waiting' || !session ? (
        <MessageCard title="Venter på læreren" text="Venter på at læreren skal starte økten. Oppgavene dukker opp her av seg selv." />
      ) : view === 'ended' ? (
        <MessageCard
          title="Økten er avsluttet"
          text={`Læreren har avsluttet økten, så du kan ikke levere flere svar. Du leverte ${doneCount} av ${tasks.length} oppgaver.`}
        />
      ) : (
        <>
          <nav aria-label="Bla mellom oppgavene" className="flex items-center justify-between gap-4 px-20 pb-4">
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              className="flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-card-border bg-background px-3 text-small text-primary hover:bg-surface-light disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-5" aria-hidden />
              Forrige oppgave
            </button>
            <p className="text-small text-muted" aria-live="polite">
              {index < tasks.length ? `Oppgave ${index + 1} av ${tasks.length}` : 'Oversikt'} · {doneCount} av {tasks.length} levert
            </p>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              disabled={index >= tasks.length}
              className="flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-card-border bg-background px-3 text-small text-primary hover:bg-surface-light disabled:cursor-not-allowed disabled:opacity-40"
            >
              Neste oppgave
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </nav>
          {sendFailed && (
            <p role="alert" className="mx-20 mb-4 rounded-lg bg-surface-variant px-4 py-2 text-small text-error">
              Svaret ble lagret her, men kom ikke fram til læreren. Sjekk nettet, og si fra til læreren.
            </p>
          )}
          <StudentTaskFlow
            tasks={tasks}
            index={index}
            onNext={() => goTo(index + 1)}
            topicId={session.topicId}
            onResult={saveResult}
            preview={{ answers: run.answers, onAnswer: answer }}
            doneSteps={done}
            ending={
              firstOpen === -1 ? undefined : (
                <div className="px-20 pb-12">
                  <section role="status" className="flex flex-col items-start gap-4 rounded-3xl border border-card-border bg-background p-8">
                    <h2 className="text-h2 text-primary">
                      Du har levert {doneCount} av {tasks.length} oppgaver
                    </h2>
                    <p className="text-lg leading-normal text-muted">Lever de andre oppgavene for å bli ferdig med økten.</p>
                    <button
                      type="button"
                      onClick={() => goTo(firstOpen)}
                      className="h-[52px] cursor-pointer rounded-lg bg-primary px-6 text-body text-on-primary hover:bg-primary/90"
                    >
                      Gå til oppgave {firstOpen + 1}
                    </button>
                  </section>
                </div>
              )
            }
          />
        </>
      )}
    </StudentLayout>
  )
}
