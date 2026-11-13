import { useState } from 'react'
import { finalResultOf, type TaskAnswerState, type TaskResultSummary } from './studentTasks'

/** Tilstand styrt utenfra – brukes av lærerens forhåndsvisning, som husker svar per oppgave. */
export interface ControlledTaskState<T> {
  state: T
  onChange: (state: T) => void
}

/**
 * Tilstanden til én oppgaveskjerm. For eleven ligger den i skjermen selv (og forsvinner med den);
 * i forhåndsvisningen styres den utenfra. Overgangene er de samme i begge tilfeller.
 *
 * `onResult` kalles én gang når oppgaven blir ferdig rettet (riktig, eller svaret vist etter siste forsøk). Bare
 * elevvisningen sender den – forhåndsvisningen lagrer ingenting.
 */
export function useTaskState<T extends TaskAnswerState>(initial: () => T, controlled?: ControlledTaskState<T>, onResult?: (result: TaskResultSummary) => void) {
  const [own, setOwn] = useState(initial)
  const state = controlled ? controlled.state : own
  const write = controlled ? controlled.onChange : setOwn
  const setState = (next: T) => {
    if (onResult && !finalResultOf(state)) {
      const result = finalResultOf(next)
      if (result) onResult(result)
    }
    write(next)
  }
  return [state, setState] as const
}
