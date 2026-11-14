import { CircleCheck, Clock3, PencilLine, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PlayIcon } from '../../components/ui/icons'
import { useAuth } from '../../hooks/useAuth'
import type { UserProfile } from '../../types'
import { FullPageMessage } from '../auth/ProtectedRoute'
import { useSessions } from '../sessions/sessionsContext'
import { StudentProgressRow } from './StudentProgressRow'
import { students } from '../class/students'
import { sessionCrumbs } from '../sessions/crumbs'
import { PageBreadcrumbs } from '../../components/layout/PageBreadcrumbs'
import { useLiveBackend } from './liveBackend'
import { buildRoster, classOverview, liveClassId, overviewCounts, RUN_STATE_LABELS, runIdOf, runStateFor } from './liveProgress'
import { useLiveSession, useRunProgress } from './useLiveSession'

const clock = (date: Date) =>
  date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')

/** Elevkontoene i klassen (Firestore), så klasselista kan kobles til elevenes innlogging. */
function useClassAccounts(classId: string) {
  const backend = useLiveBackend()
  const [accounts, setAccounts] = useState<UserProfile[]>([])
  useEffect(() => backend.subscribeClassStudents(classId, setAccounts, () => setAccounts([])), [backend, classId])
  return accounts
}

/**
 * «Følg elevenes arbeid»: økta som pågår, med hver elevs faktiske framdrift. Oppdateres av seg selv når en elev leverer
 * en oppgave (Firestore-lytting). Framdriften hører til gjennomføringen som ble startet sist, og står igjen etter at
 * økta er avsluttet.
 */
export function LiveSessionPage() {
  const { sessionId = '' } = useParams()
  const backend = useLiveBackend()
  const { sessions, getTasks, complete } = useSessions()
  const { profile } = useAuth()
  const session = sessions.find((s) => s.id === sessionId)
  const tasks = getTasks(sessionId)
  const classId = session ? liveClassId(profile?.classId, session.className) : null

  const { live, failed } = useLiveSession(classId)
  const runState = runStateFor(live, sessionId)
  const runId = live && runState !== 'planned' ? runIdOf(live) : null
  const { docs, failed: progressFailed } = useRunProgress(classId ?? '', runId)
  const accounts = useClassAccounts(classId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!session || !classId) return <FullPageMessage text="Fant ikke økten." />

  const roster = buildRoster(students, accounts)
  const rows = classOverview(roster, docs, runId, tasks, runState !== 'planned')
  const counts = overviewCounts(rows)
  const active = runState === 'running' || runState === 'paused'
  const lastUpdate = Math.max(live && runState !== 'planned' ? live.startedAt : 0, live?.endedAt ?? 0, ...docs.map((d) => d.updatedAt))

  const stats: { icon: LucideIcon; value: number; label: string }[] = [
    { icon: Clock3, value: counts.notStarted, label: 'Ikke startet' },
    { icon: PencilLine, value: counts.working, label: 'Pågår' },
    { icon: CircleCheck, value: counts.finished, label: 'Fullført' },
  ]

  const perColumn = Math.max(1, Math.ceil(rows.length / 3))
  const columns = [0, 1, 2].map((i) => rows.slice(i * perColumn, i * perColumn + perColumn))

  const run = async (action: () => Promise<unknown>, failText: string) => {
    setBusy(true)
    setError(null)
    const ok = await action()
    setBusy(false)
    if (ok === false) setError(failText)
  }

  const start = () =>
    run(() => backend.startLiveSession(classId, session.id), 'Klarte ikke å starte økten. Sjekk at du er logget inn som lærer i klassen.')

  const togglePause = () => run(() => backend.setLiveStatus(classId, runState === 'paused' ? 'running' : 'paused'), 'Klarte ikke å endre økten.')

  const end = () =>
    run(async () => {
      const ok = await backend.endLiveSession(classId)
      if (ok) complete(session.id)
      return ok
    }, 'Klarte ikke å avslutte økten. Prøv igjen.')

  const dot = runState === 'running' ? 'bg-understanding' : runState === 'paused' ? 'bg-needs-support' : 'bg-secondary'

  return (
    <div className="flex max-w-[1109px] flex-col gap-7">
      <div className="flex flex-col gap-6">
        <PageBreadcrumbs items={[...sessionCrumbs(session), { label: 'Følg elevenes arbeid' }]} />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-h1 text-primary">Følg elevenes arbeid</h1>
            <p className="text-base text-secondary">
              {session.title} · Klasse {classId} · {tasks.length} oppgaver
            </p>
          </div>
          <div className="flex items-center gap-3">
            {active ? (
              <>
                <button
                  type="button"
                  onClick={end}
                  disabled={busy}
                  className="h-12 cursor-pointer rounded-lg border-[0.5px] border-neutral-400 bg-background px-5 text-body text-primary hover:bg-neutral-100 disabled:cursor-wait"
                >
                  Avslutt økt
                </button>
                <button
                  type="button"
                  onClick={togglePause}
                  disabled={busy}
                  className="flex h-12 cursor-pointer items-center justify-center gap-6 px-5 rounded-lg border border-on-primary bg-primary text-lg font-medium text-on-primary drop-shadow-[0_4px_6px_rgba(36,58,95,0.2)] hover:bg-primary/90 disabled:cursor-wait"
                >
                  {runState === 'paused' ? 'Fortsett økt' : 'Pause økt'}
                  {runState === 'paused' ? (
                    <PlayIcon />
                  ) : (
                    <span className="relative size-6" aria-hidden>
                      <span className="absolute top-1.5 left-1 h-3 w-1 rounded-[1px] bg-on-primary" />
                      <span className="absolute top-1.5 left-4 h-3 w-1 rounded-[1px] bg-on-primary" />
                    </span>
                  )}
                </button>
              </>
            ) : (
              <>
                <Link
                  to={`/okt/${session.id}`}
                  className="flex h-12 items-center rounded-lg border-[0.5px] border-neutral-400 bg-background px-5 text-body text-primary hover:bg-neutral-100"
                >
                  Tilbake til økten
                </Link>
                {live !== undefined && (
                  <button
                    type="button"
                    onClick={start}
                    disabled={busy}
                    className="flex h-12 cursor-pointer items-center gap-2.5 rounded-lg bg-primary px-5 text-body text-on-primary drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)] hover:bg-primary/90 disabled:cursor-wait"
                  >
                    <PlayIcon />
                    {runState === 'ended' ? 'Start økten på nytt' : 'Start økt'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-small text-error">
            {error}
          </p>
        )}

        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-tertiary px-[18px] py-3.5 text-small">
          <div className="flex items-center gap-2.5">
            <span className={`size-2 rounded-full ${dot}`} aria-hidden />
            <span className="font-medium text-primary" data-testid="okt-status">
              {failed ? 'Fikk ikke kontakt med økten' : live === undefined ? 'Kobler til …' : RUN_STATE_LABELS[runState]}
            </span>
            {live && runState !== 'planned' && <span className="text-secondary">Startet kl. {clock(new Date(live.startedAt))}</span>}
            {live?.endedAt && runState === 'ended' && <span className="text-secondary">Avsluttet kl. {clock(new Date(live.endedAt))}</span>}
          </div>
          {lastUpdate > 0 && <span className="text-secondary">Sist oppdatert kl. {clock(new Date(lastUpdate))}</span>}
        </div>
        {runState === 'planned' && live !== undefined && (
          <p className="-mt-3 text-small text-secondary">
            Elevene ser «Venter på at læreren skal starte økten» til du trykker «Start økt».
          </p>
        )}
        {runState === 'ended' && <p className="-mt-3 text-small text-secondary">Resultatene under er de endelige for denne økten.</p>}
        {progressFailed && (
          <p role="alert" className="text-small text-error">
            Fikk ikke hentet elevenes framdrift. Sjekk at Firestore-reglene i firestore.rules er publisert.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map(({ icon: Icon, value, label }) => (
          <div key={label} className="flex flex-1 items-center gap-3.5 rounded-lg bg-background p-[18px]">
            <span className="flex size-10 items-center justify-center rounded-lg bg-tertiary text-secondary">
              <Icon className="size-5" />
            </span>
            <span className="flex flex-col gap-[5px]">
              <span className="text-[28px] leading-normal font-medium text-primary">{value}</span>
              <span className="text-small leading-normal text-secondary">{label}</span>
            </span>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-[18px]">
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-h2 text-primary">Elever</h2>
            <p className="text-small text-secondary">Framdriften viser hvor mange oppgaver hver elev har levert.</p>
          </div>
          <p className="text-small text-secondary">{rows.length} elever</p>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {columns.map((column, i) => (
            <ul key={i} className="overflow-hidden rounded-lg bg-background">
              {column.map((row) => (
                <StudentProgressRow key={row.student.id} row={row} tasks={tasks.filter((t) => t.level === row.level)} />
              ))}
            </ul>
          ))}
        </div>
      </section>
    </div>
  )
}
