import { Check, CircleCheck } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { AiBadge } from '../../components/ui/AiBadge'
import { Button } from '../../components/ui/Button'
import { Tag } from '../../components/ui/Tag'
import { CircleCheckIcon, EditIcon, TrashIcon } from '../../components/ui/icons'
import { levelStyles } from '../../components/ui/levelStyles'
import type { Task } from '../../types'
import { AiAssistant } from './AiAssistant'
import { DiscardChangesDialog } from './DiscardChangesDialog'
import { TaskEditor } from './TaskEditor'
import { TaskPreview } from './TaskPreview'
import { answerOf, expressionOf, needsWorksheet } from './taskUtils'

interface TaskCardProps {
  task: Task
  number: number
  /** Temaet for økta – gis til AI-assistenten som kontekst. */
  topic: string
  selected: boolean
  /** Oppgaven er endret siden redigeringen startet. */
  changed: boolean
  onSelect: () => void
  onChange: (task: Task) => void
  onDelete: () => void
  onSave: () => void
  /** Lukker redigeringen og setter oppgaven tilbake slik den var. */
  onCancel: () => void
}

/** «Oppgavekort». Valgt kort viser redigeringspanel og AI-assistent. */
export function TaskCard({ task, number, topic, selected, changed, onSelect, onChange, onDelete, onSave, onCancel }: TaskCardProps) {
  const level = levelStyles[task.level]
  const levelTag = `${level.surface} ${level.text}`
  const [confirming, setConfirming] = useState(false)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const wasSelected = useRef(selected)

  // Fokus tilbake til «Rediger oppgave» når redigeringen lukkes.
  useEffect(() => {
    if (wasSelected.current && !selected) editButtonRef.current?.focus()
    wasSelected.current = selected
  }, [selected])

  const requestClose = () => (changed ? setConfirming(true) : onCancel())

  const keepEditing = () => {
    setConfirming(false)
    editorRef.current?.querySelector('input')?.focus()
  }

  // Escape lukker redigeringen. Når bekreftelsen er åpen, lukker Escape bare den (håndteres i Modal).
  const onKeyDown = (event: KeyboardEvent) => {
    if (!selected || confirming || event.key !== 'Escape') return
    event.preventDefault()
    requestClose()
  }

  return (
    <article
      onKeyDown={onKeyDown}
      className={`flex flex-col gap-3 rounded-lg bg-background ${
        // Tykkere ramme, mindre padding – så kortet ikke flytter seg når det velges.
        selected ? 'border-4 border-primary p-[15px]' : 'border border-surface p-[18px]'
      }`}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-body text-primary">Oppgave {number}</h3>
          <Tag className={levelTag}>Nivå {task.level}</Tag>
          <Tag>{task.type}</Tag>
          {needsWorksheet(task) && <Tag className={levelTag}>Trenger regneark</Tag>}
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

      <TaskPreview task={task} />

      {selected ? (
        <>
          <div ref={editorRef}>
            <TaskEditor task={task} taskNumber={number} onChange={onChange} onClose={requestClose} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {changed && <p className="mr-auto text-xs text-secondary">Endringene er ikke lagret</p>}
            <Button variant="neutral" onClick={requestClose}>
              Avbryt
            </Button>
            <Button onClick={onSave}>
              <Check className="size-4" strokeWidth={2.2} aria-hidden />
              Lagre
            </Button>
          </div>
          <AiAssistant task={task} taskNumber={number} topic={topic} />
        </>
      ) : (
        <>
          <button
            ref={editButtonRef}
            type="button"
            onClick={onSelect}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-surface bg-background px-3 py-[7px] text-[13px] text-primary hover:bg-surface-light"
          >
            <EditIcon />
            Rediger oppgave
          </button>
          <p className="flex items-center gap-[5px] text-xs text-level2">
            <CircleCheckIcon />
            Fasit: {expressionOf(task)} = {answerOf(task)}
          </p>
          {task.aiGenerated && !task.reviewed && (
            <button
              type="button"
              onClick={() => onChange({ ...task, reviewed: true })}
              className="flex cursor-pointer items-center gap-1.5 self-start rounded-md border border-surface bg-background px-3 py-[7px] text-[13px] text-primary hover:bg-surface-light"
            >
              <CircleCheck className="size-4" aria-hidden />
              Merk som gjennomgått
            </button>
          )}
        </>
      )}

      {confirming && (
        <DiscardChangesDialog
          taskNumber={number}
          onKeepEditing={keepEditing}
          onDiscard={() => {
            setConfirming(false)
            onCancel()
          }}
        />
      )}
    </article>
  )
}
