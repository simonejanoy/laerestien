import { Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type { Level, Task } from '../../types'
import { FullPageMessage } from '../auth/ProtectedRoute'
import { sessionLabel, useSessions } from '../sessions/sessionsContext'
import { LevelTabs } from './LevelTabs'
import { TaskCard } from './TaskCard'
import { sessionCrumbs } from '../sessions/crumbs'
import { PageBreadcrumbs } from '../../components/layout/PageBreadcrumbs'

const toLevel = (value: string | null): Level => (value === '2' ? 2 : value === '3' ? 3 : 1)

export function EditTasksPage() {
  const { sessionId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { sessions, getTasks, saveTasks } = useSessions()
  const session = sessions.find((s) => s.id === sessionId)

  // Utkast som lagres med «Lagre endringer».
  const [draft, setDraft] = useState<Task[]>(() => getTasks(sessionId))
  const [dirty, setDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (!session) return <FullPageMessage text="Fant ikke økten." />

  const level = toLevel(searchParams.get('niva'))
  const group = session.levels.find((g) => g.level === level)
  const levelTasks = draft.filter((t) => t.level === level)

  const update = (tasks: Task[]) => {
    setDraft(tasks)
    setDirty(true)
  }

  const selectLevel = (next: Level) => {
    setSearchParams({ niva: String(next) }, { replace: true })
    setSelectedId(null)
  }

  const addTask = () => {
    const task: Task = {
      id: `ny-${Date.now()}`,
      level,
      type: 'Hoderegning',
      instruction: 'Regn ut.',
      a: 0,
      operator: '+',
      b: 0,
    }
    update([...draft, task])
    setSelectedId(task.id)
  }

  const save = () => {
    saveTasks(session.id, draft)
    setDirty(false)
  }

  return (
    <div className="flex max-w-[1109px] flex-col gap-6">
      <div className="flex flex-col gap-4">
        <PageBreadcrumbs items={[...sessionCrumbs(session), { label: 'Rediger oppgaver' }]} />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-h1 text-primary">
              {session.title} · Økt {sessionLabel(session)}
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-small text-secondary">
                {parseInt(session.className)}. trinn · {draft.length} oppgaver
              </span>
              {session.date && (
                <span className="rounded-[5px] bg-tertiary px-2 py-[3px] text-xs text-secondary">
                  Dato: {session.date}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={save}
              className="flex h-[42px] cursor-pointer items-center gap-2 rounded-[7px] bg-primary px-4 text-small text-on-primary hover:bg-primary/90"
            >
              <Check className="size-[18px]" strokeWidth={2.2} />
              Lagre endringer
            </button>
            <p role="status" className="text-xs text-secondary">
              {dirty ? 'Du har endringer som ikke er lagret' : 'Alle endringer er lagret'}
            </p>
          </div>
        </div>
      </div>

      <LevelTabs
        levels={session.levels}
        selected={level}
        countFor={(l) => draft.filter((t) => t.level === l).length}
        onSelect={selectLevel}
      />

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-h2 text-primary">Oppgaver i nivå {level}</h2>
            <p className="text-[13px] text-secondary">
              {levelTasks.length} oppgaver{group && ` · ${group.subtitle.replace(/\.$/, '').toLowerCase()}`}
            </p>
          </div>
          <button
            type="button"
            onClick={addTask}
            className="flex h-[38px] cursor-pointer items-center gap-[7px] rounded-[7px] border border-surface bg-background px-3.5 text-small text-primary hover:bg-surface-light"
          >
            <Plus className="size-4" strokeWidth={2.2} />
            Legg til oppgave
          </button>
        </div>

        {levelTasks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-surface p-8 text-center text-small text-secondary">
            Ingen oppgaver på dette nivået ennå. Trykk «Legg til oppgave» for å lage den første.
          </p>
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
            {levelTasks.map((task, i) => (
              <TaskCard
                key={task.id}
                task={task}
                number={i + 1}
                selected={task.id === selectedId}
                onSelect={() => setSelectedId(task.id)}
                onChange={(changed) => update(draft.map((t) => (t.id === changed.id ? changed : t)))}
                onDelete={() => update(draft.filter((t) => t.id !== task.id))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
