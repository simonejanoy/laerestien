import type { StudentProgress } from '../../types'

// Framdriften fra Figma. Testdata frem til Firestore er på plass.

/** Framdrift når siden åpnes. `done: -1` betyr «alle oppgavene». */
export const initialProgress: Record<string, StudentProgress> = {
  amalie: { started: true, done: 1 },
  sofie: { started: false, done: 0 },
  ella: { started: true, done: -1 },
  noah: { started: true, done: -1 },
  ada: { started: true, done: -1 },
  nora: { started: true, done: -1 },
  aksel: { started: true, done: 1 },
  filip: { started: true, done: -1 },
  jakob: { started: true, done: 1 },
  maja: { started: true, done: 0 },
  elias: { started: true, done: 1 },
  olivia: { started: true, done: 1 },
  emil: { started: true, done: 0 },
  isak: { started: true, done: 0 },
  iben: { started: true, done: 0 },
  emma: { started: true, done: 1 },
  leo: { started: true, done: 1 },
  oskar: { started: false, done: 0 },
}
