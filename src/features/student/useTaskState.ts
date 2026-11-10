import { useState } from 'react'

/** Tilstand styrt utenfra – brukes av lærerens forhåndsvisning, som husker svar per oppgave. */
export interface ControlledTaskState<T> {
  state: T
  onChange: (state: T) => void
}

/**
 * Tilstanden til én oppgaveskjerm. For eleven ligger den i skjermen selv (og forsvinner med den);
 * i forhåndsvisningen styres den utenfra. Overgangene er de samme i begge tilfeller.
 */
export function useTaskState<T>(initial: () => T, controlled?: ControlledTaskState<T>) {
  const [own, setOwn] = useState(initial)
  const state = controlled ? controlled.state : own
  const setState = controlled ? controlled.onChange : setOwn
  return [state, setState] as const
}
