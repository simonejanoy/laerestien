import { Check, ChevronLeft, ChevronRight, PencilLine } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PlayIcon } from '../../components/ui/icons'
import { startLiveSession } from '../../lib/liveSession'
import { FullPageMessage } from '../auth/ProtectedRoute'
import { LevelCard } from './LevelCard'
import { SessionGoals } from './SessionGoals'
import { SessionPlan } from './SessionPlan'
import { SessionSummaryCard } from './SessionSummaryCard'
import { SkipSessionModal } from './SkipSessionModal'
import { StartSessionModal } from './StartSessionModal'
import { sessionLabel, useSessions } from './sessionsContext'

const HIDE_EXPLANATION_KEY = 'laerestien:skjulStartForklaring'

function readHideExplanation() {
  try {
    return localStorage.getItem(HIDE_EXPLANATION_KEY) === 'true'
  } catch {
    return false
  }
}

export function SessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { sessions, getStatus, getBlockers, skip, getTasks } = useSessions()
  const [modal, setModal] = useState<'start' | 'skip' | null>(null)

  const index = sessions.findIndex((s) => s.id === sessionId)
  const session = sessions[index]
  if (!session) return <FullPageMessage text="Fant ikke økten." />

  const previous = sessions[index - 1]
  const next = sessions[index + 1]
  const status = getStatus(session.id)
  const blockers = getBlockers(session.id)
  const canStart = status === 'available' || status === 'skipped'
  const tasks = getTasks(session.id)

  const startSession = () => {
    void startLiveSession(session.className, session.id)
    navigate(`/okt/${session.id}/live`)
  }

  const handleStartClick = () => {
    if (readHideExplanation()) startSession()
    else setModal('start')
  }

  const handleConfirmStart = (hideExplanation: boolean) => {
    if (hideExplanation) {
      try {
        localStorage.setItem(HIDE_EXPLANATION_KEY, 'true')
      } catch {
        // Ikke kritisk – forklaringen vises bare igjen neste gang.
      }
    }
    startSession()
  }

  return (
    <div className="flex max-w-[1109px] flex-col gap-10">
      <div className="flex flex-col gap-5 pr-5 pb-[30px]">
        <div className="flex items-center gap-2.5 p-2.5 text-on-background">
          <SessionArrow to={previous && `/okt/${previous.id}`} label="Forrige økt" direction="left" />
          <h1 className="text-h1">
            {session.title} - økt. {sessionLabel(session)}
          </h1>
          <SessionArrow to={next && `/okt/${next.id}`} label="Neste økt" direction="right" />
        </div>

        <div className="flex items-start justify-between gap-6">
          <SessionSummaryCard session={session} />

          <div className="flex flex-col items-end gap-2.5">
            <button
              type="button"
              disabled={!canStart}
              onClick={handleStartClick}
              className="flex h-[70px] cursor-pointer items-center gap-2.5 rounded-[10px] bg-primary px-[30px] text-h3 text-on-primary drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50 disabled:shadow-[0_2px_4px_rgba(0,0,0,0.25)] disabled:drop-shadow-none"
            >
              <PlayIcon />
              Start økt
            </button>

            {status === 'completed' && (
              <p className="flex items-center gap-[5px] text-body text-understanding">
                Økt gjennomført
                <Check className="size-6" />
              </p>
            )}
            {status === 'locked' && (
              <button
                type="button"
                onClick={() => setModal('skip')}
                className="cursor-pointer text-body text-primary underline"
              >
                Hopp over økt {blockers.map(sessionLabel).join(' og ')} og lås opp
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-[15px]">
        <div className="flex items-end justify-between">
          <h2 className="text-h2 text-black">Oppgaver</h2>
          <Link
            to={`/okt/${session.id}/rediger`}
            className="flex items-center gap-2.5 rounded-[10px] border border-surface p-2.5 text-small text-primary hover:bg-surface-light"
          >
            <PencilLine className="size-5" />
            Rediger oppgavene
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-6">
          {session.levels.map((group) => (
            <LevelCard
              key={group.level}
              group={
                tasks.length > 0
                  ? { ...group, taskCount: tasks.filter((t) => t.level === group.level).length }
                  : group
              }
              to={`/okt/${session.id}/rediger?niva=${group.level}`}
            />
          ))}
        </div>
      </section>

      <div className="flex items-start gap-10">
        <SessionGoals title="Mål for økten" goals={session.goals} />
        <SessionPlan items={session.plan} />
      </div>

      <StartSessionModal
        open={modal === 'start'}
        session={session}
        onClose={() => setModal(null)}
        onConfirm={handleConfirmStart}
      />
      <SkipSessionModal
        open={modal === 'skip'}
        session={session}
        blockers={blockers}
        onClose={() => setModal(null)}
        onConfirm={() => {
          skip(blockers.map((b) => b.id))
          setModal(null)
        }}
      />
    </div>
  )
}

function SessionArrow({
  to,
  label,
  direction,
}: {
  to?: string
  label: string
  direction: 'left' | 'right'
}) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight
  if (!to) return <Icon className="size-6 opacity-30" aria-hidden />
  return (
    <Link to={to} aria-label={label} className="rounded hover:bg-surface-light">
      <Icon className="size-6" />
    </Link>
  )
}
