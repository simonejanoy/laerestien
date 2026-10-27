import { Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Session, Task } from '../../types'
import { LevelCard } from '../sessions/LevelCard'
import { sessionLabel } from '../sessions/sessionsContext'

interface SessionBrowserProps {
  session: Session
  tasks: Task[]
  previous?: Session
  next?: Session
  onSelect: (session: Session) => void
}

const linkButton =
  'flex items-center gap-[5px] rounded-lg bg-secondary px-[15px] py-2.5 text-small text-white transition-colors hover:bg-secondary/90'

/** Venstre kolonne på temasiden: bla mellom øktene og se innholdet. */
export function SessionBrowser({ session, tasks, previous, next, onSelect }: SessionBrowserProps) {
  return (
    <section className="flex flex-col">
      <div className="flex h-10 items-center justify-center gap-5 rounded-t-lg bg-secondary text-body text-white">
        <BrowseButton session={previous} label="Forrige økt" direction="left" onSelect={onSelect} />
        <span>
          Økt {sessionLabel(session)} av {session.totalSessions}
        </span>
        <BrowseButton session={next} label="Neste økt" direction="right" onSelect={onSelect} />
      </div>

      <div className="flex flex-col gap-5 rounded-b-lg bg-surface-light p-5">
        <div className="flex flex-col gap-[15px] rounded-lg bg-background p-2.5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-[5px]">
                <h2 className="text-h2 text-primary">Økt {sessionLabel(session)}</h2>
                {session.numbers.length > 1 && <p className="text-small text-black/50">Dobbeltøkt</p>}
              </div>
              <div className="flex items-center gap-[15px] text-small text-secondary">
                {session.date && (
                  <span className="flex items-center gap-[5px]">
                    <Calendar className="size-6" />
                    {session.date}
                  </span>
                )}
                {session.time && (
                  <span className="flex items-center gap-[5px]">
                    <Clock className="size-6" />
                    {session.time}
                  </span>
                )}
              </div>
            </div>
            <Link to={`/okt/${session.id}`} className={linkButton}>
              Gå til økt
              <ChevronRight className="size-6" />
            </Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <h3 className="text-h3 text-primary">{session.heading}</h3>
            <p className="text-small text-black">{session.description}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 rounded-lg bg-background p-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-h3 text-black">Oppgaver</h3>
            <Link to={`/okt/${session.id}/rediger`} className={`${linkButton} gap-2.5`}>
              Gå til oppgaver
              <ChevronRight className="size-6" />
            </Link>
          </div>
          {session.levels.map((group) => (
            <LevelCard
              key={group.level}
              compact
              group={
                tasks.length > 0
                  ? { ...group, taskCount: tasks.filter((t) => t.level === group.level).length }
                  : group
              }
              to={`/okt/${session.id}/rediger?niva=${group.level}`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function BrowseButton({
  session,
  label,
  direction,
  onSelect,
}: {
  session?: Session
  label: string
  direction: 'left' | 'right'
  onSelect: (session: Session) => void
}) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!session}
      onClick={() => session && onSelect(session)}
      className="cursor-pointer rounded disabled:cursor-default disabled:opacity-30"
    >
      <Icon className="size-6" />
    </button>
  )
}
