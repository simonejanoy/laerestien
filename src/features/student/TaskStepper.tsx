import { Fragment } from 'react'

interface TaskStepperProps {
  total: number
  /** Indeks (0-basert) for oppgaven eleven er på. */
  current: number
  /** Er oppgaven eleven er på, besvart riktig? */
  currentDone: boolean
  /** Hvilke oppgaver som er levert, når eleven kan bla fritt (elevvisningen). Uten den: alle før den eleven er på. */
  done?: boolean[]
}

/** ①—②—③—④: hvor langt eleven har kommet i økta. */
export function TaskStepper({ total, current, currentDone, done: doneSteps }: TaskStepperProps) {
  const doneCount = currentDone ? current + 1 : current

  return (
    <ol aria-label="Oppgaver i økta" className="flex min-w-0 flex-1 items-center justify-center px-9">
      {Array.from({ length: total }, (_, i) => {
        const done = doneSteps ? !!doneSteps[i] || (i === current && currentDone) : i < doneCount
        const isCurrent = i === current && !done
        return (
          <Fragment key={i}>
            {i > 0 && (
              <li
                aria-hidden
                className={`h-0.5 w-[66px] min-w-3 shrink ${i <= current ? 'bg-secondary' : 'bg-step'}`}
              />
            )}
            <li
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`Oppgave ${i + 1}${done ? ', ferdig' : ''}`}
              className={`flex size-9 shrink-0 items-center justify-center rounded-full text-body ${
                done
                  ? 'border-2 border-secondary bg-secondary text-on-secondary'
                  : isCurrent
                    ? 'border-4 border-secondary bg-background text-on-background'
                    : 'border-2 border-step bg-white text-on-background'
              }`}
            >
              {i + 1}
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}
