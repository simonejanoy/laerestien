import { ChevronLeft, ChevronRight, Eraser, RotateCcw } from 'lucide-react'
import { Component, useCallback, useLayoutEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Modal, ModalCloseButton } from '../../components/ui/Modal'
import type { Level, Session, SessionTask } from '../../types'
import { sessionLabel } from '../sessions/sessionsContext'
import { Greeting } from '../student/StatusScreens'
import { StudentLayout } from '../student/StudentLayout'
import { StudentTaskFlow } from '../student/StudentTaskFlow'
import { previewProblem, verbFor } from '../student/studentTasks'
import { STUDENT_VIEW_WIDTH, fitScale, initialPreviewState, previewControls, previewReducer } from './studentPreviewState'

interface StudentPreviewDialogProps {
  session: Session
  level: Level
  /** Oppgavene på nivået fra lærerens utkast (også ulagrede endringer), i elevens rekkefølge. */
  tasks: SessionTask[]
  onClose: () => void
}

/**
 * Lærerens forhåndsvisning av oppgavene slik en elev på nivået ser dem. Bruker den samme
 * oppgaveflyten og de samme oppgaveskjermene som elevvisningen.
 *
 * Testmodus: hvor læreren er og testsvarene per oppgave-ID ligger bare i komponentens tilstand.
 * Ingenting skrives til localStorage, Firebase, elevprofiler, statistikk eller den aktive økta.
 * Alt forsvinner når popupen lukkes, og den starter på første oppgave neste gang.
 */
export function StudentPreviewDialog({ session, level, tasks, onClose }: StudentPreviewDialogProps) {
  const [state, dispatch] = useReducer(previewReducer, undefined, initialPreviewState)
  const { canGoBack, canGoForward, canClear, currentTaskId } = previewControls(
    state,
    tasks.map((t) => t.id),
  )
  const stageRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const { scale, stageHeight } = useFitScale(stageRef, viewRef)

  const task = tasks[state.index]
  const problem = task ? previewProblem(task) : null
  const next = () => dispatch({ type: 'next', total: tasks.length })
  const previous = () => dispatch({ type: 'previous' })

  return (
    <Modal open onClose={onClose} labelledBy="elevvisning-tittel" fullScreen large>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 bg-primary px-6 py-2.5 text-on-primary">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id="elevvisning-tittel" className="text-h2">
            Elevvisning – nivå {level}
          </h2>
          <p className="text-small">Forhåndsvisning – ingen svar lagres</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {tasks.length > 0 && (
            <>
              <p className="text-small" aria-live="polite">
                {task ? `Oppgave ${state.index + 1} av ${tasks.length}` : 'Avslutning'}
              </p>
              <FrameButton onClick={() => currentTaskId && dispatch({ type: 'clear', taskId: currentTaskId })} disabled={!canClear}>
                <Eraser className="size-4" strokeWidth={2.2} />
                Tøm svar
              </FrameButton>
              <FrameButton onClick={() => dispatch({ type: 'restart' })}>
                <RotateCcw className="size-4" strokeWidth={2.2} />
                Start på nytt
              </FrameButton>
            </>
          )}
          <ModalCloseButton onClick={onClose} />
        </div>
      </header>

      {(tasks.length === 0 || problem) && (
        <p role="alert" className="shrink-0 border-b border-rule bg-surface-variant px-6 py-2 text-small text-error">
          {tasks.length === 0
            ? `Det er ingen oppgaver på nivå ${level}. Eleven ser bare avslutningen.`
            : `Oppgave ${state.index + 1} vises ikke riktig for elevene: ${problem}`}
        </p>
      )}

      <div className="flex min-h-0 flex-1 bg-tertiary">
        <NavColumn>
          {tasks.length > 0 && (
            <ChevronButton label="Forrige oppgave" onClick={previous} disabled={!canGoBack}>
              <ChevronLeft className="size-7" />
            </ChevronButton>
          )}
        </NavColumn>

        {/* Elevvisningen i samme utforming som hos eleven, skalert ned så oppgaven får plass. */}
        <div ref={stageRef} className="min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div
            ref={viewRef}
            className="mx-auto flex flex-col"
            style={{ zoom: scale, width: STUDENT_VIEW_WIDTH, minHeight: stageHeight / scale }}
          >
            <StudentLayout label={`${session.title} økt ${sessionLabel(session)}`} embedded>
              <Greeting text={`Hei! ${verbFor(tasks)}`} />
              <PreviewBoundary key={`${state.round}-${state.index}`} taskNumber={state.index + 1} onSkip={next}>
                <StudentTaskFlow
                  key={state.round}
                  tasks={tasks}
                  index={state.index}
                  onNext={next}
                  topicId={session.topicId}
                  preview={{ answers: state.answers, onAnswer: (taskId, answer) => dispatch({ type: 'answer', taskId, state: answer }) }}
                />
              </PreviewBoundary>
            </StudentLayout>
          </div>
        </div>

        <NavColumn>
          {tasks.length > 0 && (
            <ChevronButton label="Neste oppgave" onClick={next} disabled={!canGoForward}>
              <ChevronRight className="size-7" />
            </ChevronButton>
          )}
        </NavColumn>
      </div>
    </Modal>
  )
}

/**
 * Skalaen elevvisningen får i forhåndsvisningen: ut fra plassen i popupen og høyden oppgaven
 * læreren står på trenger i full størrelse. Elevvisningen har fast bredde før skaleringen, så
 * høyden avhenger ikke av skalaen (ingen vipping fram og tilbake). Regnes ut på nytt når popupen
 * endrer størrelse og etter hver endring i visningen (ny oppgave, hint, levert svar …).
 */
function useFitScale(stageRef: RefObject<HTMLDivElement | null>, viewRef: RefObject<HTMLDivElement | null>) {
  const [fit, setFit] = useState({ scale: 1, stageHeight: 0 })

  const measure = useCallback(() => {
    const stage = stageRef.current
    const view = viewRef.current
    if (!stage || !view) return
    // Elevens toppfelt + innholdet under (ikke bakgrunnen, som strekkes til hele høyden).
    const header = view.querySelector('header')
    const main = view.querySelector('main')
    const contentHeight =
      (header?.offsetHeight ?? 0) + [...(main?.children ?? [])].reduce((sum, child) => sum + (child as HTMLElement).offsetHeight, 0)
    const next = { scale: fitScale(stage.clientWidth, stage.clientHeight, contentHeight), stageHeight: stage.clientHeight }
    setFit((prev) => (prev.scale === next.scale && prev.stageHeight === next.stageHeight ? prev : next))
  }, [stageRef, viewRef])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [stageRef, measure])

  // Etter hver oppdatering: innholdet kan ha fått ny høyde.
  useLayoutEffect(measure)

  return fit
}

function NavColumn({ children }: { children: ReactNode }) {
  return <div className="flex w-[72px] shrink-0 items-center justify-center">{children}</div>
}

function ChevronButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-12 cursor-pointer items-center justify-center rounded-full bg-primary text-on-primary shadow-md hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function FrameButton({ onClick, disabled = false, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[38px] cursor-pointer items-center gap-2 rounded-lg border border-on-primary/40 px-3.5 text-small hover:bg-on-primary/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

/**
 * Fanger en oppgave elevvisningen ikke klarer å tegne (f.eks. ødelagte data), så læreren får en
 * forklaring i stedet for en tom eller krasjet forhåndsvisning – og kan gå videre.
 */
class PreviewBoundary extends Component<{ taskNumber: number; onSkip: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="px-20 pb-12">
        <section role="alert" className="flex flex-col items-start gap-3 rounded-3xl border border-error bg-background p-8">
          <h2 className="text-h2 text-error">Oppgave {this.props.taskNumber} kan ikke vises i elevvisningen</h2>
          <p className="text-body text-primary">
            Oppgaven har et format elevvisningen ikke kan gjengi. Elevene vil ikke kunne løse den. Rett eller slett oppgaven i
            redigeringen.
          </p>
          <button
            type="button"
            onClick={this.props.onSkip}
            className="h-[42px] cursor-pointer rounded-lg bg-primary px-4 text-small text-on-primary hover:bg-primary/90"
          >
            Gå til neste oppgave
          </button>
        </section>
      </div>
    )
  }
}
