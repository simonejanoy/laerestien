import { ChevronDown } from 'lucide-react'
import { CircleCheckIcon, EditIcon } from '../../components/ui/icons'
import type { Operator, Task, TaskType } from '../../types'
import { answerOf, expressionOf, operatorSymbol } from './taskUtils'

const taskTypes: TaskType[] = ['Hoderegning', 'Oppstilling']

const inputClass =
  'w-full rounded-md border border-surface bg-background px-2.5 py-[7px] text-small text-primary outline-none focus:border-secondary'

/** «Redigeringspanel» – bare synlig for læreren. */
export function TaskEditor({ task, onChange }: { task: Task; onChange: (task: Task) => void }) {
  const setNumber = (key: 'a' | 'b', value: string) => {
    const n = Number(value.replace(/\s/g, ''))
    if (Number.isFinite(n) && n >= 0) onChange({ ...task, [key]: n })
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-md bg-surface-light p-3.5">
      <p className="flex items-center gap-1.5 text-[13px] text-secondary">
        <EditIcon className="text-primary" />
        Redigering · bare synlig for læreren
      </p>

      <label className="flex flex-col gap-[5px] text-xs text-secondary">
        Oppgavetekst
        <input
          value={task.instruction}
          onChange={(e) => onChange({ ...task, instruction: e.target.value })}
          className={`${inputClass} min-h-9 py-2`}
        />
      </label>

      <div className="flex gap-2.5">
        <label className="flex flex-1 flex-col gap-1 text-xs text-secondary">
          Tall 1
          <input inputMode="numeric" value={task.a} onChange={(e) => setNumber('a', e.target.value)} className={inputClass} />
        </label>
        <label className="flex w-16 shrink-0 flex-col gap-1 text-xs text-secondary">
          Regneart
          <select
            value={task.operator}
            onChange={(e) => onChange({ ...task, operator: e.target.value as Operator })}
            className={`${inputClass} cursor-pointer text-center`}
          >
            {(['+', '-'] as const).map((op) => (
              <option key={op} value={op}>
                {operatorSymbol(op)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-secondary">
          Tall 2
          <input inputMode="numeric" value={task.b} onChange={(e) => setNumber('b', e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-secondary">
          Type
          <span className="relative">
            <select
              value={task.type}
              onChange={(e) => onChange({ ...task, type: e.target.value as TaskType })}
              className={`${inputClass} cursor-pointer appearance-none pr-8`}
            >
              {taskTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-primary"
              strokeWidth={2.4}
            />
          </span>
        </label>
      </div>

      {answerOf(task) < 0 ? (
        <p role="alert" className="text-xs text-error">
          Svaret blir negativt ({expressionOf(task)} = {answerOf(task)}). Sjekk tallene.
        </p>
      ) : (
        <p className="flex items-center gap-[5px] text-xs text-level2">
          <CircleCheckIcon />
          Fasit kontrollert: {expressionOf(task)} = {answerOf(task)}
        </p>
      )}
    </div>
  )
}
