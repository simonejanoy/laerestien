import { levelStyles } from '../../components/ui/levelStyles'
import type { Student, StudentProgress } from '../../types'

interface StudentProgressRowProps {
  student: Student
  progress: StudentProgress
  total: number
}

/** «Elevfremdrift»: navn, status, framdriftslinje og nivå. */
export function StudentProgressRow({ student, progress, total }: StudentProgressRowProps) {
  const finished = progress.done >= total
  // Viser oppgaven eleven jobber med, slik at «Jobber med oppgave 2» gir 2/6.
  const shown = finished ? total : progress.started ? progress.done + 1 : 0
  const level = levelStyles[student.level]

  const status = finished
    ? `Fullført · ${total} av ${total}`
    : progress.started
      ? `Jobber med oppgave ${progress.done + 1}`
      : 'Ikke startet'

  return (
    <li className="flex h-24 flex-col justify-center gap-2.5 border-b border-divider bg-background px-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-small font-medium leading-normal text-primary">{student.name}</span>
        <span className={`shrink-0 text-xs ${finished ? 'text-understanding' : 'text-secondary'}`}>{status}</span>
      </div>
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-label={`Framdrift for ${student.name}`}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={shown}
          className="h-2 flex-1 overflow-hidden rounded-full bg-surface"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${finished ? 'bg-understanding' : 'bg-needs-support'}`}
            style={{ width: `${total > 0 ? (shown / total) * 100 : 0}%` }}
          />
        </div>
        <span className="w-7 shrink-0 text-right text-small text-secondary">
          {shown}/{total}
        </span>
      </div>
      <span className={`flex items-center gap-1.5 self-start rounded-full px-2 py-0.5 text-small ${level.surface} ${level.text}`}>
        <span className={`size-1.5 rounded-full ${level.bar}`} aria-hidden />
        Nivå {student.level}
      </span>
    </li>
  )
}
