import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { TaskFigure } from '../../components/ui/TaskFigure'
import type { TextTask } from '../../types'
import { TaskStepper } from './TaskStepper'

interface TextTaskScreenProps {
  task: TextTask
  index: number
  total: number
  onNext: () => void
}

/**
 * Tekstoppgave for eleven: les, skriv svaret og lever. Appen kan ikke rette fritekst,
 * så eleven får ikke riktig/galt her – læreren ser på svaret.
 */
export function TextTaskScreen({ task, index, total, onNext }: TextTaskScreenProps) {
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const isLast = index === total - 1

  return (
    <section className="flex flex-col items-center gap-[26px] rounded-3xl border border-card-border bg-background p-8">
      <p className="w-full text-small text-muted uppercase">Oppgave {index + 1}</p>

      <h2 className="w-full text-h2 whitespace-pre-wrap text-primary">{task.text}</h2>
      {task.figure && <TaskFigure figure={task.figure} />}

      <label className="flex w-full flex-col gap-2 text-body text-primary">
        Ditt svar
        <textarea
          autoFocus
          rows={4}
          value={answer}
          readOnly={submitted}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Skriv svaret ditt her. Du kan også vise hvordan du tenkte."
          className="w-full resize-y rounded-xl border-2 border-secondary bg-background px-[18px] py-3 text-xl text-on-background outline-none placeholder:text-lg placeholder:text-secondary read-only:bg-tertiary"
        />
      </label>

      {submitted && (
        <p role="status" className="w-full text-body text-secondary">
          Svaret ditt er levert. Læreren ser på det.
        </p>
      )}

      <hr className="h-px w-full border-0 bg-rule" />

      <div className="flex min-h-[125px] w-full items-center justify-between gap-4">
        <span className="w-[236px] shrink-0" aria-hidden />
        <TaskStepper total={total} current={index} currentDone={submitted} />
        <button
          type="button"
          disabled={!submitted && !answer.trim()}
          onClick={submitted ? onNext : () => setSubmitted(true)}
          className="flex h-[52px] w-[224px] shrink-0 cursor-pointer items-center justify-center gap-[47px] rounded-lg bg-primary text-body text-on-primary hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitted ? (isLast ? 'Ferdig' : 'Neste oppgave') : 'Lever svaret'}
          {submitted && <ChevronRight className="size-6" />}
        </button>
      </div>
    </section>
  )
}
