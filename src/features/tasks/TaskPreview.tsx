import type { Task } from '../../types'
import { expressionOf, formatNumber, operatorSymbol } from './taskUtils'

/** «Kompakt forhåndsvisning»: slik eleven ser oppgaven. */
export function TaskPreview({ task }: { task: Task }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-md bg-tertiary p-3">
      <p className="text-xs text-secondary">{task.instruction}</p>
      {task.type === 'Hoderegning' ? (
        <div className="flex items-center gap-2.5">
          <span className="text-[22px] font-medium text-primary">
            {expressionOf(task)} =
          </span>
          <span className="h-8 w-[52px] rounded-[5px] border border-secondary bg-background" aria-hidden />
        </div>
      ) : (
        <div className="flex w-[110px] flex-col gap-0.5 text-right text-xl text-primary">
          <span>{formatNumber(task.a)}</span>
          <span>
            {operatorSymbol(task.operator)} {formatNumber(task.b)}
          </span>
          <span className="h-px bg-primary" aria-hidden />
          <span className="flex h-[26px] items-center justify-center rounded border border-secondary bg-background text-xs text-secondary">
            Svar
          </span>
        </div>
      )}
    </div>
  )
}
