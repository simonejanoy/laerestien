import { levelStyles } from '../../components/ui/levelStyles'
import type { SessionTask } from '../../types'
import { PROGRESS_STATUS_LABELS, shownAnswer, type StudentOverview } from './liveProgress'

interface StudentProgressRowProps {
  row: StudentOverview
  /** Oppgavene på elevens nivå i økta, i rekkefølgen eleven får dem (til svaroversikten). */
  tasks: SessionTask[]
}

const STATUS_COLORS = {
  waiting: 'text-secondary',
  notStarted: 'text-secondary',
  working: 'text-needs-support',
  finished: 'text-understanding',
} as const

/** «Elevfremdrift»: navn, status, leverte oppgaver (med riktig/feil), framdriftslinje og nivå. */
export function StudentProgressRow({ row, tasks }: StudentProgressRowProps) {
  const { student, summary, delivered } = row
  const { done, total, percent, status } = summary
  const finished = status === 'finished'
  const level = levelStyles[row.level]

  return (
    <li data-student={student.name} className="flex min-h-24 flex-col justify-center gap-2.5 border-b border-divider bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {student.photo && <img src={student.photo} alt="" className="size-8 shrink-0 rounded-full object-cover object-top" />}
          <span className="truncate text-small font-medium leading-normal text-primary">{student.name}</span>
        </span>
        <span className={`shrink-0 text-xs ${STATUS_COLORS[status]}`}>
          {PROGRESS_STATUS_LABELS[status]} · {done} av {total} levert
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-label={`Framdrift for ${student.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent} %, ${done} av ${total} oppgaver levert`}
          className="h-2 flex-1 overflow-hidden rounded-full bg-surface"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${finished ? 'bg-understanding' : 'bg-needs-support'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="w-10 shrink-0 text-right text-small text-secondary">{percent} %</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-small ${level.surface} ${level.text}`}>
          <span className={`size-1.5 rounded-full ${level.bar}`} aria-hidden />
          Nivå {row.level}
        </span>
        {done > 0 && (
          <ol aria-label={`Svarene til ${student.name}`} className="flex flex-wrap gap-1">
            {tasks.map((task, i) => {
              const d = delivered[task.id]
              const text = !d ? 'ikke levert' : d.correct === true ? 'riktig' : d.correct === false ? 'feil' : 'levert, vurderes av deg'
              const style = !d
                ? 'border-step bg-white text-muted'
                : d.correct === true
                  ? 'border-understanding bg-understanding text-white'
                  : d.correct === false
                    ? 'border-error bg-error text-white'
                    : 'border-secondary bg-secondary text-on-secondary'
              return (
                <li
                  key={task.id}
                  title={`Oppgave ${i + 1}: ${text}`}
                  aria-label={`Oppgave ${i + 1}: ${text}`}
                  className={`flex size-5 items-center justify-center rounded-full border text-[11px] ${style}`}
                >
                  {d?.correct === true ? '✓' : d?.correct === false ? '✗' : i + 1}
                </li>
              )
            })}
          </ol>
        )}
      </div>
      {tasks.some((t) => delivered[t.id]?.answer) && (
        <details className="text-small text-primary">
          <summary className="cursor-pointer text-xs text-secondary hover:text-primary">Se svarene til {student.name}</summary>
          <ol aria-label={`Leverte svar fra ${student.name}`} className="mt-2 flex flex-col gap-1.5">
            {tasks.map((task, i) => {
              const d = delivered[task.id]
              if (!d?.answer) return null
              const result = d.correct === true ? 'Riktig' : d.correct === false ? 'Feil' : 'Vurderes av deg'
              const tries = d.correct !== null && d.attempts > 1 ? ` · ${d.attempts} forsøk` : ''
              return (
                <li key={task.id} className="flex flex-col gap-0.5 rounded-md bg-surface-light px-2.5 py-1.5">
                  <span className="text-xs text-secondary">
                    Oppgave {i + 1} · {result}
                    {tries}
                  </span>
                  <span className="whitespace-pre-wrap break-words">{shownAnswer(task, d.answer)}</span>
                </li>
              )
            })}
          </ol>
        </details>
      )}
    </li>
  )
}
