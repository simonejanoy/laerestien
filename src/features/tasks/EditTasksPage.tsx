import { Check, Eye, Plus } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type { Level, SessionTask, Task } from '../../types'
import { FullPageMessage } from '../auth/ProtectedRoute'
import { sessionLabel, useSessions } from '../sessions/sessionsContext'
import { AddTasksDialog } from './AddTasksDialog'
import { isPeriod } from '../repetition/analysis'
import { RepetitionPlanner } from '../repetition/RepetitionPlanner'
import { LevelTabs } from './LevelTabs'
import { StudentPreviewDialog } from './StudentPreviewDialog'
import { TaskCard } from './TaskCard'
import { TextTaskCard } from './TextTaskCard'
import { sessionCrumbs, sessionWhen } from '../sessions/crumbs'
import { PageBreadcrumbs } from '../../components/layout/PageBreadcrumbs'

const toLevel = (value: string | null): Level => (value === '2' ? 2 : value === '3' ? 3 : 1)

export function EditTasksPage() {
  const { sessionId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { sessions, getTasks, saveTasks, storageNotice } = useSessions()
  const session = sessions.find((s) => s.id === sessionId)

  // Utkast som lagres med «Lagre endringer».
  const [draft, setDraft] = useState<SessionTask[]>(() => getTasks(sessionId))
  const [dirty, setDirty] = useState(false)
  // Oppgaven som redigeres, og hvordan den så ut før redigeringen startet («Avbryt» setter den tilbake).
  const [editing, setEditing] = useState<{ id: string; original: Task } | null>(null)
  // Forhåndsvisningen viser utkastet (starter på valgt nivå). Den endrer ikke utkastet og lagrer ingenting.
  const [previewOpen, setPreviewOpen] = useState(false)
  const closePreview = useCallback(() => setPreviewOpen(false), [])
  // «Legg til oppgaver»: popupen med «Lag med AI» og «Lag selv». Fokus går tilbake til knappen når den lukkes.
  const [adding, setAdding] = useState(false)
  const [addedNote, setAddedNote] = useState('')
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const closeAdding = useCallback(() => {
    setAdding(false)
    setTimeout(() => addButtonRef.current?.focus())
  }, [])

  if (!session) return <FullPageMessage text="Fant ikke økten." />

  const level = toLevel(searchParams.get('niva'))
  const group = session.levels.find((g) => g.level === level)
  const levelTasks = draft.filter((t) => t.level === level)

  const update = (tasks: SessionTask[]) => {
    setDraft(tasks)
    setDirty(true)
  }

  const selectLevel = (next: Level) => {
    setSearchParams({ niva: String(next) }, { replace: true })
    setEditing(null)
  }

  const save = () => {
    saveTasks(session.id, draft)
    setDirty(false)
  }

  // AI-oppgaver legges i utkastet (merket som ikke gjennomgått) og lagres med «Lagre endringer», som før.
  const addAiTasks = (tasks: SessionTask[]) => {
    update([...draft, ...tasks])
    setAddedNote('')
  }

  // En oppgave læreren har laget selv, lagres med en gang på nivået den hører til. Siden blir stående der den var: valgt
  // nivå og rulleposisjon endres ikke.
  const addManualTask = (task: SessionTask) => {
    const next = [...draft, task]
    setDraft(next)
    saveTasks(session.id, next)
    setDirty(false)
    setAddedNote(task.level === level ? `Oppgaven er lagt til nederst på nivå ${task.level}.` : `Oppgaven er lagt til på nivå ${task.level}.`)
    closeAdding()
  }

  const isChanged = (task: Task) => {
    const original = editing?.id === task.id ? editing.original : task
    return (Object.keys(task) as (keyof Task)[]).some((key) => task[key] !== original[key])
  }

  const cancelEdit = () => {
    if (editing) setDraft((prev) => prev.map((t) => (t.id === editing.id ? editing.original : t)))
    setEditing(null)
  }

  const saveEdit = () => {
    save()
    setEditing(null)
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
              {sessionWhen(session) && (
                <span className="rounded-[5px] bg-tertiary px-2 py-[3px] text-xs text-secondary">{sessionWhen(session)}</span>
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
            {storageNotice && (
              <p role="alert" className="max-w-[24rem] text-right text-xs text-error">
                {storageNotice}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Repetisjonsøkter: oppgaver ut fra hva hvert nivå har strevd med i perioden. */}
      {isPeriod(session.topicId) && (
        <RepetitionPlanner session={session} period={session.topicId} tasks={draft} onAdd={(tasks) => update([...draft, ...tasks])} />
      )}

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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="flex h-[38px] cursor-pointer items-center gap-[7px] rounded-[7px] border border-surface bg-background px-3.5 text-small text-primary hover:bg-surface-light"
            >
              <Eye className="size-4" strokeWidth={2.2} />
              Forhåndsvis
            </button>
            <button
              ref={addButtonRef}
              type="button"
              onClick={() => setAdding(true)}
              aria-haspopup="dialog"
              className="flex h-[38px] cursor-pointer items-center gap-[7px] rounded-[7px] bg-primary px-3.5 text-small text-on-primary hover:bg-primary/90"
            >
              <Plus className="size-4" strokeWidth={2.2} aria-hidden />
              Legg til oppgaver
            </button>
          </div>
        </div>
        <p role="status" className="text-small text-secondary empty:hidden">
          {addedNote}
        </p>

        {levelTasks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-surface p-8 text-center text-small text-secondary">
            Ingen oppgaver på dette nivået ennå. Trykk «Legg til oppgaver» for å lage den første.
          </p>
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
            {levelTasks.map((task, i) => {
              // Oppgaver læreren endrer selv, regnes som lærerens egne (gode eksempler for AI-en).
              // AI-oppgaver beholder AI-merket – «gjennomgått» settes med egen knapp.
              const onChange = (changed: SessionTask) =>
                update(draft.map((t) => (t.id === changed.id ? (changed.aiGenerated ? changed : { ...changed, source: 'teacher' as const }) : t)))
              const onDelete = () => {
                update(draft.filter((t) => t.id !== task.id))
                if (editing?.id === task.id) setEditing(null)
              }
              return task.kind === 'text' ? (
                <TextTaskCard
                  key={task.id}
                  task={task}
                  number={i + 1}
                  topic={session.topic}
                  className={session.className}
                  onChange={onChange}
                  onDelete={onDelete}
                />
              ) : (
                <TaskCard
                  key={task.id}
                  task={task}
                  number={i + 1}
                  topic={session.topic}
                  selected={task.id === editing?.id}
                  changed={isChanged(task)}
                  onSelect={() => setEditing({ id: task.id, original: task })}
                  onChange={onChange}
                  onDelete={onDelete}
                  onSave={saveEdit}
                  onCancel={cancelEdit}
                />
              )
            })}
          </div>
        )}
      </section>

      {adding && (
        <AddTasksDialog session={session} tasks={draft} level={level} onAddAi={addAiTasks} onAddManual={addManualTask} onClose={closeAdding} />
      )}
      {previewOpen && <StudentPreviewDialog session={session} level={level} tasks={draft} onClose={closePreview} />}
    </div>
  )
}
