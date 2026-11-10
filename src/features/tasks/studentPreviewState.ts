import { hasAnswerState, type TaskAnswerState } from '../student/studentTasks.ts'

// Tilstanden i lærerens elevvisning: hvor læreren er, og svarene på hver oppgave (per ID).
// Bare i minnet – den forsvinner når popupen lukkes. Ren funksjon, så den kan testes i Node.

export interface PreviewState {
  /** 0 … antall-1 er oppgavene; lik antallet er avslutningen («Bra jobba!»). */
  index: number
  /** Midlertidige testsvar per oppgave-ID, så de beholdes når læreren blar fram og tilbake. */
  answers: Record<string, TaskAnswerState>
  /** Øker ved «Start på nytt», så alt i visningen begynner helt på nytt. */
  round: number
}

export type PreviewAction =
  /** Høyre chevron og elevens «Neste oppgave»/«Ferdig» – høyst til avslutningen. */
  | { type: 'next'; total: number }
  /** Venstre chevron – også fra avslutningen tilbake til siste oppgave. */
  | { type: 'previous' }
  | { type: 'answer'; taskId: string; state: TaskAnswerState }
  /** «Tøm svar»: bare denne oppgaven. */
  | { type: 'clear'; taskId: string }
  /** «Start på nytt»: alle svar, og tilbake til første oppgave. */
  | { type: 'restart' }

export const initialPreviewState = (): PreviewState => ({ index: 0, answers: {}, round: 0 })

export function previewReducer(state: PreviewState, action: PreviewAction): PreviewState {
  switch (action.type) {
    case 'next':
      return { ...state, index: Math.min(state.index + 1, Math.max(action.total, 0)) }
    case 'previous':
      return { ...state, index: Math.max(state.index - 1, 0) }
    case 'answer':
      return { ...state, answers: { ...state.answers, [action.taskId]: action.state } }
    case 'clear': {
      const answers = { ...state.answers }
      delete answers[action.taskId]
      return { ...state, answers }
    }
    case 'restart':
      return { ...initialPreviewState(), round: state.round + 1 }
  }
}

/** Hva chevronene og «Tøm svar» kan gjøre nå. */
export function previewControls(state: PreviewState, taskIds: string[]) {
  const current = taskIds[state.index]
  return {
    canGoBack: state.index > 0,
    // Høyre chevron stopper på siste oppgave; avslutningen nås med elevens «Ferdig».
    canGoForward: state.index < taskIds.length - 1,
    canClear: current !== undefined && hasAnswerState(state.answers[current]),
    currentTaskId: current,
  }
}

/** Bredden elevvisningen tegnes i før den skaleres (som en vanlig bærbar skjerm hos eleven). */
export const STUDENT_VIEW_WIDTH = 1200
/** Mindre enn dette blir teksten for liten å lese; da ruller visningen i stedet. */
export const MIN_PREVIEW_SCALE = 0.7

/**
 * Hvor mye elevvisningen skaleres for at oppgaven læreren står på skal få plass i forhåndsvisningen:
 * aldri større enn hos eleven, og aldri så liten at teksten blir vanskelig å lese.
 * `contentHeight` er høyden elevvisningen trenger i full størrelse (i STUDENT_VIEW_WIDTH bredde).
 */
export function fitScale(width: number, height: number, contentHeight: number) {
  if (width <= 0 || height <= 0 || contentHeight <= 0) return 1
  const scale = Math.min(1, width / STUDENT_VIEW_WIDTH, height / contentHeight)
  return Math.max(MIN_PREVIEW_SCALE, Math.floor(scale * 100) / 100)
}
