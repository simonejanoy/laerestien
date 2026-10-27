import { Tag } from '../../components/ui/Tag'
import { CircleCheckIcon, EditIcon, TrashIcon } from '../../components/ui/icons'
import { levelStyles } from '../../components/ui/levelStyles'
import type { Task } from '../../types'
import { AiAssistant } from './AiAssistant'
import { TaskEditor } from './TaskEditor'
import { TaskPreview } from './TaskPreview'
import { answerOf, expressionOf, needsWorksheet } from './taskUtils'

interface TaskCardProps {
  task: Task
  number: number
  selected: boolean
  onSelect: () => void
  onChange: (task: Task) => void
  onDelete: () => void
}

/** «Oppgavekort». Valgt kort viser redigeringspanel og AI-assistent. */
export function TaskCard({ task, number, selected, onSelect, onChange, onDelete }: TaskCardProps) {
  const level = levelStyles[task.level]
  const levelTag = `${level.surface} ${level.text}`

  return (
    <article
      className={`flex flex-col gap-3 rounded-lg bg-background p-[18px] ${
        selected ? `border-2 ${level.border}` : 'border border-surface'
      }`}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-body text-primary">Oppgave {number}</h3>
          <Tag className={levelTag}>Nivå {task.level}</Tag>
          <Tag>{task.type}</Tag>
          {needsWorksheet(task) && <Tag className={levelTag}>Trenger regneark</Tag>}
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
          <TaskEditor task={task} onChange={onChange} />
          <AiAssistant task={task} taskNumber={number} />
        </>
      ) : (
        <>
          <button
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
        </>
      )}
    </article>
  )
}
