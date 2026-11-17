import { TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { SessionTask, Student } from '../../types'
import { levelsWithoutTasks, missingLevelsText } from './liveProgress'

/**
 * Advarsel til læreren når økta mangler oppgaver på et nivå der det står elever (f.eks. nivå 3). De elevene får
 * ellers ingen oppgaver. Vises ingenting når alle nivåene med elever har oppgaver.
 */
export function MissingLevelsWarning({ sessionId, roster, tasks, className = '' }: {
  sessionId: string
  roster: Pick<Student, 'name' | 'level'>[]
  tasks: Pick<SessionTask, 'level'>[]
  className?: string
}) {
  const missing = levelsWithoutTasks(roster, tasks)
  if (missing.length === 0) return null
  const lines = missingLevelsText(missing)
  return (
    <div role="alert" data-testid="mangler-niva" className={`flex gap-2.5 rounded-lg border border-needs-support bg-background px-4 py-3 text-small text-primary ${className}`}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-needs-support" aria-hidden />
      <div className="flex flex-col gap-1">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <Link to={`/okt/${sessionId}/rediger?niva=${missing[0].level}`} className="text-primary underline">
          Legg til oppgaver på nivå {missing.map((m) => m.level).join(' og ')}
        </Link>
      </div>
    </div>
  )
}
