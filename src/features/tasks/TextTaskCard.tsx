import { Check, CircleCheck, EyeOff } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { AiBadge } from '../../components/ui/AiBadge'
import { Button } from '../../components/ui/Button'
import { Tag } from '../../components/ui/Tag'
import { EditIcon, TrashIcon } from '../../components/ui/icons'
import { levelStyles } from '../../components/ui/levelStyles'
import type { TextTask } from '../../types'
import { AiReviseForm } from './AiReviseForm'
import { DiscardChangesDialog } from './DiscardChangesDialog'

interface TextTaskCardProps {
  task: TextTask
  number: number
  /** Temaet for økta – sendes med når læreren justerer med AI. */
  topic: string
  className: string
  onChange: (task: TextTask) => void
  onDelete: () => void
}

const fieldClass =
  'w-full resize-y rounded-md border border-surface bg-background px-2.5 py-2 text-small text-primary outline-none focus:border-secondary'

/** Fritekstoppgave i redigeringsvisningen: elevtekst og fasit hver for seg, og AI-status. */
export function TextTaskCard({ task, number, topic, className, onChange, onDelete }: TextTaskCardProps) {
  const level = levelStyles[task.level]
  const [editing, setEditing] = useState<{ text: string; solution: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [aiNote, setAiNote] = useState('')

  const changed = editing !== null && (editing.text !== task.text || editing.solution !== task.solution)
  const close = () => {
    setEditing(null)
    setConfirming(false)
  }
  const requestClose = () => (changed ? setConfirming(true) : close())

  const save = () => {
    if (!editing?.text.trim() || !editing.solution.trim()) return
    onChange({ ...task, text: editing.text.trim(), solution: editing.solution.trim() })
    close()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!editing || confirming || event.key !== 'Escape') return
    event.preventDefault()
    requestClose()
  }

  return (
    <article
      onKeyDown={onKeyDown}
      className={`flex flex-col gap-3 rounded-lg bg-background ${
        editing ? 'border-4 border-primary p-[15px]' : 'border border-surface p-[18px]'
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-body text-primary">Oppgave {number}</h3>
          <Tag className={`${level.surface} ${level.text}`}>Nivå {task.level}</Tag>
          <Tag>Tekstoppgave</Tag>
          {task.aiGenerated && <AiBadge status={task.reviewed ? 'reviewed' : 'unreviewed'} />}
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Slett oppgave ${number}`}
          className="shrink-0 cursor-pointer rounded text-secondary hover:text-error"
        >
          <TrashIcon />
        </button>
      </header>

      {editing ? (
        <div className="flex flex-col gap-2.5 rounded-md bg-surface-light p-3.5">
          <label className="flex flex-col gap-1 text-xs text-secondary">
            Oppgavetekst til eleven
            <textarea
              autoFocus
              rows={3}
              value={editing.text}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-secondary">
            Fasit og løsningsforslag (bare for læreren)
            <textarea
              rows={3}
              value={editing.solution}
              onChange={(e) => setEditing({ ...editing, solution: e.target.value })}
              className={fieldClass}
            />
          </label>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {changed && <p className="mr-auto text-xs text-secondary">Endringene er ikke lagret</p>}
            <Button variant="neutral" onClick={requestClose}>
              Avbryt
            </Button>
            <Button onClick={save} disabled={!editing.text.trim() || !editing.solution.trim()}>
              <Check className="size-4" strokeWidth={2.2} aria-hidden />
              Lagre
            </Button>
          </div>
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-1.5 rounded-md bg-tertiary p-3">
            <h4 className="text-xs text-secondary">Til eleven</h4>
            <p className="text-small whitespace-pre-wrap text-primary">{task.text}</p>
          </section>
          <section className="flex flex-col gap-1.5 rounded-md border border-dashed border-secondary p-3">
            <h4 className="flex items-center gap-1.5 text-xs text-secondary">
              <EyeOff className="size-3.5" aria-hidden />
              Fasit og løsningsforslag · bare for læreren
            </h4>
            <p className="text-small whitespace-pre-wrap text-on-background">{task.solution}</p>
          </section>
        </>
      )}

      {(task.competenceGoal || task.adaptation) && (
        <dl className="flex flex-col gap-1 text-xs text-secondary">
          {task.competenceGoal && (
            <div>
              <dt className="inline">Kompetansemål (oppgitt av deg): </dt>
              <dd className="inline text-on-background">{task.competenceGoal}</dd>
            </div>
          )}
          {task.adaptation && (
            <div>
              <dt className="inline">Tilpasning: </dt>
              <dd className="inline text-on-background">{task.adaptation}</dd>
            </div>
          )}
        </dl>
      )}

      {!editing && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing({ text: task.text, solution: task.solution })}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-surface bg-background px-3 py-[7px] text-[13px] text-primary hover:bg-surface-light"
          >
            <EditIcon />
            Rediger selv
          </button>
          {task.aiGenerated && !task.reviewed && (
            <button
              type="button"
              onClick={() => onChange({ ...task, reviewed: true })}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-surface bg-background px-3 py-[7px] text-[13px] text-primary hover:bg-surface-light"
            >
              <CircleCheck className="size-4" aria-hidden />
              Merk som gjennomgått
            </button>
          )}
        </div>
      )}

      {!editing && (
        <AiReviseForm
          task={task}
          context={{ subject: 'Matematikk', grade: `${parseInt(className)}. trinn`, topic }}
          label={`Juster oppgave ${number} med AI`}
          onRevised={(revised, message) => {
            onChange({ ...revised, id: task.id })
            setAiNote(message)
          }}
        />
      )}
      {aiNote && (
        <p role="status" className="rounded-md bg-surface-light px-3 py-2 text-xs text-on-background">
          <span className="font-medium">Fra AI-assistenten:</span> {aiNote}
        </p>
      )}

      {confirming && <DiscardChangesDialog taskNumber={number} onKeepEditing={() => setConfirming(false)} onDiscard={close} />}
    </article>
  )
}
