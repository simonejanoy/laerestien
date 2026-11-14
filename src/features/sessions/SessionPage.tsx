import { CalendarClock, Check, ChevronLeft, ChevronRight, Eye, PencilLine, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PlayIcon } from '../../components/ui/icons'
import { useAuth } from '../../hooks/useAuth'
import { useLiveBackend } from '../live/liveBackend'
import { liveClassId, RUN_STATE_LABELS, runStateFor } from '../live/liveProgress'
import { useLiveSession } from '../live/useLiveSession'
import { FullPageMessage } from '../auth/ProtectedRoute'
import { DeleteSessionDialog } from './DeleteSessionDialog'
import { LevelCard } from './LevelCard'
import { SessionFormDialog } from './SessionFormDialog'
import { SessionGoals } from './SessionGoals'
import { SessionPlan } from './SessionPlan'
import { SessionSummaryCard } from './SessionSummaryCard'
import { SkipSessionModal } from './SkipSessionModal'
import { StartSessionModal } from './StartSessionModal'
import { sessionLabel, useSessions } from './sessionsContext'
import { sessionCrumbs, sessionWhen } from './crumbs'
import { PageBreadcrumbs } from '../../components/layout/PageBreadcrumbs'
import { StudentPreviewDialog } from '../tasks/StudentPreviewDialog'

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
  const { sessions, getStatus, getBlockers, skip, getTasks, updateSession, removeSession } = useSessions()
  const [modal, setModal] = useState<'start' | 'skip' | 'edit' | 'delete' | null>(null)
  const { profile } = useAuth()
  const backend = useLiveBackend()
  const [startError, setStartError] = useState<string | null>(null)
  // Forhåndsvisningen av oppgavene slik elevene ser dem. Lagrer ingenting, og starter tom hver gang.
  const [previewOpen, setPreviewOpen] = useState(false)

  const index = sessions.findIndex((s) => s.id === sessionId)
  const session = sessions[index]
  const classId = session ? liveClassId(profile?.classId, session.className) : null
  // Om økta bare er planlagt, er i gang (eller på pause) eller er avsluttet – fra økta som er lagret for klassen.
  const { live } = useLiveSession(classId)
  if (!session || !classId) return <FullPageMessage text="Fant ikke økten." />

  const previous = sessions[index - 1]
  const next = sessions[index + 1]
  const status = getStatus(session.id)
  const blockers = getBlockers(session.id)
  const runState = runStateFor(live, session.id)
  const isActive = runState === 'running' || runState === 'paused'
  // En økt som er i gang, startes ikke på nytt – læreren går til «Følg elevenes arbeid».
  const canStart = isActive || status === 'available' || status === 'skipped'
  // En annen økt er i gang i klassen: den erstattes når denne startes.
  const otherActive = !!live && live.sessionId !== session.id && (live.status === 'running' || live.status === 'paused')
  const tasks = getTasks(session.id)

  const startSession = async () => {
    setStartError(null)
    const started = await backend.startLiveSession(classId, session.id)
    if (!started) {
      setModal(null)
      setStartError('Klarte ikke å starte økta for elevene. Sjekk at du er logget inn som lærer i klassen, og prøv igjen.')
      return
    }
    navigate(`/okt/${session.id}/live`)
  }

  const handleStartClick = () => {
    if (isActive) navigate(`/okt/${session.id}/live`)
    else if (readHideExplanation()) void startSession()
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
    void startSession()
  }

  return (
    <div className="flex max-w-[1109px] flex-col gap-8">
      <div className="flex flex-col gap-4">
        <PageBreadcrumbs items={sessionCrumbs(session, true)} />
        <div className="flex flex-wrap items-center gap-2.5 text-on-background">
          <SessionArrow to={previous && `/okt/${previous.id}`} label="Forrige økt" direction="left" />
          <h1 className="text-h1">
            {session.title} - økt. {sessionLabel(session)}
          </h1>
          <SessionArrow to={next && `/okt/${next.id}`} label="Neste økt" direction="right" />
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => setModal('edit')}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-surface px-3 text-small text-primary hover:bg-surface-light"
            >
              <PencilLine className="size-4" aria-hidden />
              Rediger økt
            </button>
            <button
              type="button"
              onClick={() => setModal('delete')}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-surface px-3 text-small text-error hover:bg-surface-light"
            >
              <Trash2 className="size-4" aria-hidden />
              Slett økt
            </button>
          </div>
        </div>
        {sessionWhen(session) && (
          <p className="-mt-2 flex items-center gap-2 text-body text-secondary">
            <CalendarClock className="size-5 shrink-0" aria-hidden />
            {sessionWhen(session)}
          </p>
        )}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <SessionSummaryCard session={session} />

          <div className="flex flex-col items-end gap-2.5">
            <button
              type="button"
              disabled={!canStart}
              onClick={handleStartClick}
              className="flex h-12 cursor-pointer items-center gap-2.5 rounded-lg bg-primary px-5 text-body text-on-primary drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50 disabled:shadow-[0_2px_4px_rgba(0,0,0,0.25)] disabled:drop-shadow-none"
            >
              <PlayIcon />
              {isActive ? 'Følg elevenes arbeid' : 'Start økt'}
            </button>

            {live !== undefined && (
              <p data-testid="okt-status" className="flex items-center gap-2 text-small text-secondary">
                <span
                  aria-hidden
                  className={`size-2 rounded-full ${runState === 'running' ? 'bg-understanding' : runState === 'paused' ? 'bg-needs-support' : 'bg-step'}`}
                />
                {RUN_STATE_LABELS[runState]}
                {runState === 'ended' && (
                  <Link to={`/okt/${session.id}/live`} className="text-primary underline">
                    Se resultatene
                  </Link>
                )}
              </p>
            )}
            {otherActive && !isActive && (
              <p className="max-w-xs text-right text-small text-secondary">En annen økt er i gang i klassen. Den avsluttes for elevene når du starter denne.</p>
            )}

            {startError && (
              <p role="alert" className="max-w-xs text-right text-small text-error">
                {startError}
              </p>
            )}
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
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-h2 text-black">Oppgaver</h2>
          <div className="flex flex-wrap gap-2">
            {/* Oppgavene slik elevene ser dem, på nivå 1–3. Ingen svar lagres. */}
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-surface p-2.5 text-small text-primary hover:bg-surface-light"
            >
              <Eye className="size-5" />
              Forhåndsvis
            </button>
            <Link
              to={`/okt/${session.id}/rediger`}
              className="flex items-center gap-2.5 rounded-[10px] border border-surface p-2.5 text-small text-primary hover:bg-surface-light"
            >
              <PencilLine className="size-5" />
              Rediger oppgavene
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

      <div className="flex flex-col items-stretch gap-6 lg:flex-row lg:items-start">
        <SessionGoals title="Mål for økten" goals={session.goals} />
        <SessionPlan items={session.plan} />
      </div>

      {modal === 'edit' && (
        <SessionFormDialog
          open
          session={session}
          onClose={() => setModal(null)}
          onSave={(input) => {
            updateSession(session.id, input)
            setModal(null)
          }}
        />
      )}
      {modal === 'delete' && (
        <DeleteSessionDialog
          session={session}
          onCancel={() => setModal(null)}
          onConfirm={() => {
            removeSession(session.id)
            navigate('/')
          }}
        />
      )}
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

      {previewOpen && <StudentPreviewDialog session={session} level={1} tasks={tasks} onClose={() => setPreviewOpen(false)} />}
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
