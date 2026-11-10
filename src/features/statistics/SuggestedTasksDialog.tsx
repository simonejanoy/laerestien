import { EyeOff, LoaderCircle, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AiError, SLOW_AI_HINT, fallbackNotice, newTaskId, requestTasks, subjectContext, toTextTask } from '../../ai/client'
import type { AnonStudentProfile } from '../../ai/contract'
import { AiBadge } from '../../components/ui/AiBadge'
import { Button } from '../../components/ui/Button'
import { Modal, ModalCloseButton } from '../../components/ui/Modal'
import { levelStyles } from '../../components/ui/levelStyles'
import { useSlowAiHint } from '../../hooks/useSlowAiHint'
import type { TextTask } from '../../types'
import { AiReviseForm } from '../tasks/AiReviseForm'

/** Vises bare når den er åpen – forslagene lages hver gang den åpnes. */
interface SuggestedTasksDialogProps {
  /** Vises bare for læreren – sendes ikke til AI-en. */
  studentName: string
  studentId: string
  classId: string
  /** Anonymiserte elevdata som AI-en får. */
  profile: AnonStudentProfile
  onClose: () => void
  onConfirm: (tasks: TextTask[]) => void
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; message: string; notice: string | null }

/**
 * «Forslag fra AI til …»: individuelt tilpassede oppgaver. De er bare forslag – ingenting
 * legges til før læreren har åpnet hvert forslag og trykket «Legg til oppgaver».
 */
export function SuggestedTasksDialog({
  studentName,
  studentId,
  classId,
  profile,
  onClose,
  onConfirm,
}: SuggestedTasksDialogProps) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [tasks, setTasks] = useState<TextTask[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  // Forslagene læreren har åpnet. Alle må åpnes før de kan legges til.
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const [attempt, setAttempt] = useState(0)
  const slow = useSlowAiHint(state.status === 'loading', 'tasks')

  useEffect(() => {
    let cancelled = false
    requestTasks({ kind: 'individual', classId, context: subjectContext(classId), student: profile, count: 4, wishes: '' })
      .then(({ tasks: drafts, message, meta }) => {
        if (cancelled) return
        const suggestions = drafts.map((d) => toTextTask(d, newTaskId(studentId), meta))
        setTasks(suggestions)
        setSelectedId(suggestions[0]?.id)
        setSeen(new Set(suggestions.slice(0, 1).map((t) => t.id)))
        setState({ status: 'ready', message, notice: fallbackNotice(meta, 'Forslagene') })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (!(err instanceof AiError)) console.error('Uventet feil ved individuelle oppgaveforslag:', err)
        setState({ status: 'error', message: err instanceof AiError ? err.message : 'Noe gikk galt. Prøv igjen.' })
      })
    return () => {
      cancelled = true
    }
  }, [attempt, classId, profile, studentId])

  const selected = tasks.find((t) => t.id === selectedId)
  const unseen = tasks.filter((t) => !seen.has(t.id)).length

  const select = (id: string) => {
    setSelectedId(id)
    setSeen((prev) => new Set(prev).add(id))
  }

  const remove = (id: string) => {
    const rest = tasks.filter((t) => t.id !== id)
    setTasks(rest)
    if (id === selectedId && rest[0]) select(rest[0].id)
  }

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="forslag-tittel"
      wide
      className="gap-5 shadow-[0_16px_48px_rgba(36,59,94,0.18)]"
    >
      <div className="flex items-start gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <h2 id="forslag-tittel" className="text-h2 text-on-background">
            Forslag fra AI til {studentName}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-small text-secondary">
            <AiBadge status="suggestion" />
            Oppgavene er ikke lagt til ennå. Åpne og vurder hvert forslag før du legger dem til.
          </p>
        </div>
        <ModalCloseButton onClick={onClose} />
      </div>

      {state.status === 'loading' && (
        // Fast høyde, så dialogen ikke hopper når forslagene kommer.
        <p aria-live="polite" className="flex min-h-64 items-center justify-center gap-2 text-small text-secondary">
          <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden />
          {slow ? SLOW_AI_HINT : `AI-en lager forslag ut fra ${studentName}s resultater …`}
        </p>
      )}

      {state.status === 'error' && (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3">
          <p role="alert" className="text-small text-error">
            {state.message}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setState({ status: 'loading' })
              setAttempt((a) => a + 1)
            }}
          >
            Prøv igjen
          </Button>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          {state.message && (
            <p className="rounded-md bg-surface-light px-3 py-2 text-small text-on-background">
              <span className="font-medium">Fra AI-assistenten:</span> {state.message}
            </p>
          )}
          {state.notice && <p className="text-xs text-secondary">{state.notice}</p>}
          <div className="flex flex-col gap-5 md:flex-row">
            <ul className="flex flex-1 flex-col gap-1.5">
              {tasks.map((task, i) => {
                const isSelected = task.id === selected?.id
                const level = levelStyles[task.level]
                return (
                  <li
                    key={task.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                      isSelected ? 'border-secondary bg-tertiary' : 'border-surface bg-background'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => select(task.id)}
                      aria-current={isSelected ? 'true' : undefined}
                      className="flex min-w-0 flex-1 cursor-pointer flex-col text-left"
                    >
                      <span className="text-body text-on-background">Forslag {i + 1}</span>
                      <span className="line-clamp-1 text-small text-secondary">{task.text}</span>
                    </button>
                    <span className="text-xs text-secondary">{seen.has(task.id) ? 'Åpnet' : 'Ikke åpnet'}</span>
                    <span className={`rounded-full px-2 py-0.5 text-small ${level.surface} ${level.text}`}>Nivå {task.level}</span>
                    <button
                      type="button"
                      aria-label={`Fjern forslag ${i + 1}`}
                      onClick={() => remove(task.id)}
                      className="cursor-pointer text-primary hover:text-error"
                    >
                      <Trash2 className="size-5" />
                    </button>
                  </li>
                )
              })}
              {tasks.length === 0 && <li className="text-small text-secondary">Ingen forslag igjen.</li>}
            </ul>

            {selected && (
              <aside className="flex w-full shrink-0 flex-col gap-3 rounded-xl bg-tertiary p-5 md:w-[340px]">
                <section className="flex flex-col gap-1.5 rounded-lg bg-background p-3">
                  <h3 className="text-xs text-secondary">Til eleven</h3>
                  <p className="text-small whitespace-pre-wrap text-primary">{selected.text}</p>
                </section>
                <section className="flex flex-col gap-1.5 rounded-lg border border-dashed border-secondary p-3">
                  <h3 className="flex items-center gap-1.5 text-xs text-secondary">
                    <EyeOff className="size-3.5" aria-hidden />
                    Fasit og løsningsforslag · bare for læreren
                  </h3>
                  <p className="text-small whitespace-pre-wrap text-on-background">{selected.solution}</p>
                </section>
                {selected.adaptation && (
                  <p className="text-xs text-secondary">
                    Tilpasning: <span className="text-on-background">{selected.adaptation}</span>
                  </p>
                )}
                <AiReviseForm
                  key={selected.id}
                  task={selected}
                  context={{ ...subjectContext(classId), topic: 'Individuelt tilpassede oppgaver' }}
                  classId={classId}
                  student={profile}
                  label="Juster forslaget med AI"
                  onRevised={(revised) => setTasks((all) => all.map((t) => (t.id === selected.id ? revised : t)))}
                />
              </aside>
            )}
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span aria-live="polite" className="flex-1 text-small text-secondary">
          {state.status === 'ready' &&
            (unseen > 0
              ? `Åpne alle forslagene før du legger dem til (${tasks.length - unseen} av ${tasks.length} åpnet).`
              : `${tasks.length} forslag er klare. De legges bare til hvis du trykker «Legg til oppgaver».`)}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="h-[49px] cursor-pointer rounded-lg border border-secondary px-[22px] text-body text-on-background hover:bg-tertiary"
        >
          Avbryt
        </button>
        <Button
          size="lg"
          disabled={state.status !== 'ready' || tasks.length === 0 || unseen > 0}
          onClick={() => onConfirm(tasks)}
        >
          Legg til oppgaver
        </Button>
      </div>
    </Modal>
  )
}
