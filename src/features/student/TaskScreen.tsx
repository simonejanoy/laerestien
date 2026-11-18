import { ChevronRight } from 'lucide-react'
import { PreviousTaskButton } from './PreviousTaskButton'
import { useRef, type KeyboardEvent } from 'react'
import check from '../../assets/student/hake.svg'
import lightbulb from '../../assets/student/lyspaere.svg'
import type { Task } from '../../types'
import { answerOf, formatNumber, hintFor, operatorSymbol } from '../tasks/taskUtils'
import { AppleGroup } from './AppleGroup'
import { FEEDBACK, checkMathAnswer, cleanMathAnswer, initialMathState, retryMathAnswer, type MathTaskState, type TaskResultSummary } from './studentTasks'
import { TaskStepper } from './TaskStepper'
import { useTaskState, type ControlledTaskState } from './useTaskState'
import { WrongAnswerDialog } from './WrongAnswerDialog'

interface TaskScreenProps {
  task: Task
  /** Indeks (0-basert) i elevens oppgaveliste. */
  index: number
  total: number
  onNext: () => void
  /** «Forrige oppgave» nederst til venstre i kortet (bare når det går an å gå tilbake). */
  onPrevious?: () => void
  /** Bare i lærerens forhåndsvisning: tilstanden holdes utenfor, så den beholdes når læreren blar. */
  controlled?: ControlledTaskState<MathTaskState>
  /** Bare i elevvisningen: resultatet når oppgaven er ferdig rettet (lagres for repetisjonen). */
  onResult?: (result: TaskResultSummary) => void
  /** Bare i elevvisningen: hvilke oppgaver som er levert (til trinnene nederst). */
  doneSteps?: boolean[]
}

/** Én oppgave for eleven: svar, sjekk, hint og videre. */
export function TaskScreen({ task, index, total, onNext, onPrevious, controlled, onResult, doneSteps }: TaskScreenProps) {
  const [state, setState] = useTaskState(initialMathState, controlled, onResult)
  const { answer, phase, attemptsLeft, showHint, dialogOpen } = state
  const inputRef = useRef<HTMLInputElement>(null)

  // Epler brukes når tallene er små nok til å telle.
  const withApples = task.operator === '+' && task.type === 'Hoderegning' && task.a <= 12 && task.b <= 12
  const correct = phase === 'correct'
  const isLast = index === total - 1

  const checkAnswer = () => {
    if (answer === '') {
      inputRef.current?.focus()
      return
    }
    setState(checkMathAnswer(state, task))
  }

  const retry = (withHint: boolean) => {
    setState(retryMathAnswer(state, withHint))
    setTimeout(() => inputRef.current?.focus())
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') checkAnswer()
  }

  const answerField =
    phase === 'answering' ? (
      <input
        ref={inputRef}
        autoFocus
        inputMode="numeric"
        aria-label="Ditt svar"
        placeholder="Skriv svar"
        value={answer}
        onChange={(e) => setState({ ...state, answer: cleanMathAnswer(e.target.value) })}
        onKeyDown={onKeyDown}
        className="h-[66px] w-[168px] rounded-xl border-2 border-secondary bg-background px-[18px] text-[32px] text-on-background shadow-[0_0_0_4px_rgba(79,117,150,0.18)] outline-none placeholder:text-xl placeholder:font-medium placeholder:text-secondary"
      />
    ) : correct ? (
      <span className="flex h-[66px] items-center gap-3 rounded-xl border-2 border-level2 bg-level2-surface pr-3.5 pl-5 text-[32px] text-on-background">
        {answer}
        <img src={check} alt="Riktig" width={28} height={28} />
      </span>
    ) : (
      <span className="flex h-[66px] items-center rounded-xl border-2 border-secondary bg-tertiary px-5 text-[32px] text-on-background">
        {formatNumber(answerOf(task))}
      </span>
    )

  return (
    <>
      <section
        className={`flex flex-col items-center gap-[26px] rounded-3xl border border-card-border p-8 ${
          correct ? 'bg-correct' : 'bg-background'
        }`}
      >
        <p className="w-full text-small text-muted uppercase">Oppgave {index + 1}</p>

        <div className="flex w-full flex-col gap-2.5">
          <h2 className="text-h2 text-primary">
            {withApples ? 'Hvor mange epler er det til sammen?' : task.instruction}
          </h2>
          {withApples && (
            <p className="text-lg leading-normal text-muted">Tell eplene i de to gruppene. Legg antallene sammen.</p>
          )}
        </div>

        <div className="flex w-full flex-col gap-[22px]">
          {withApples && (
            <div className="flex items-center gap-4">
              <AppleGroup count={task.a} correct={correct} />
              <span className="text-4xl text-secondary" aria-hidden>
                +
              </span>
              <AppleGroup count={task.b} correct={correct} />
            </div>
          )}

          {task.type === 'Oppstilling' ? (
            <div className="mx-auto flex w-[220px] flex-col items-stretch gap-2 text-right text-[38px] font-medium text-primary">
              <span>{formatNumber(task.a)}</span>
              <span>
                {operatorSymbol(task.operator)} {formatNumber(task.b)}
              </span>
              <span className="h-0.5 bg-primary" aria-hidden />
              <div className="flex justify-end">{answerField}</div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-[22px]">
              <span className="text-[38px] font-medium text-primary">
                {formatNumber(task.a)} {operatorSymbol(task.operator)} {formatNumber(task.b)} =
              </span>
              {answerField}
            </div>
          )}

          {showHint && phase === 'answering' && (
            <p className="mx-auto flex items-center gap-2.5 rounded-lg bg-surface-variant px-4 py-3 text-body text-primary">
              <img src={lightbulb} alt="" width={22} height={22} />
              {hintFor(task)}
            </p>
          )}
          {correct && (
            <p role="status" className="mx-auto text-h3 text-level2">
              {FEEDBACK.correct}
            </p>
          )}
          {phase === 'revealed' && (
            <p role="status" className="mx-auto text-body text-secondary">
              Det var vanskelig! Svaret er {formatNumber(answerOf(task))}. Vi går videre.
            </p>
          )}
        </div>

        <hr className="h-px w-full border-0 bg-rule" />

        <div className="flex min-h-[125px] w-full items-center justify-between gap-4">
          <div className="flex shrink-0 items-center gap-3">
            {onPrevious && <PreviousTaskButton onClick={onPrevious} />}
            <button
              type="button"
              onClick={() => setState({ ...state, showHint: true })}
              className={`flex w-[236px] shrink-0 cursor-pointer items-center justify-center gap-2.5 rounded-lg bg-surface-variant p-2.5 text-body text-primary hover:brightness-95 ${
                phase === 'answering' && !showHint ? '' : 'invisible'
              }`}
            >
              <img src={lightbulb} alt="" width={22} height={22} />
              Jeg trenger et hint
            </button>
          </div>

          <TaskStepper total={total} current={index} currentDone={phase !== 'answering'} done={doneSteps} />

          <button
            type="button"
            onClick={phase === 'answering' ? checkAnswer : onNext}
            className="flex h-[52px] w-[224px] shrink-0 cursor-pointer items-center justify-center gap-[47px] rounded-lg bg-primary text-body text-on-primary hover:bg-primary/90"
          >
            {phase === 'answering' ? 'Sjekk svaret mitt' : isLast ? 'Ferdig' : 'Neste oppgave'}
            {phase !== 'answering' && <ChevronRight className="size-6" />}
          </button>
        </div>
      </section>

      <WrongAnswerDialog
        open={dialogOpen}
        attemptsLeft={attemptsLeft}
        retryText={withApples ? 'Tell eplene på nytt og skriv et nytt svar.' : 'Regn på nytt og skriv et nytt svar.'}
        onHint={() => retry(true)}
        onRetry={() => retry(false)}
      />
    </>
  )
}
