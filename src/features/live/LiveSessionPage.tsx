import { CircleCheck, Clock3, PencilLine, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PlayIcon } from '../../components/ui/icons'
import { useAuth } from '../../hooks/useAuth'
import { endLiveSession, liveClassId, setLiveStatus } from '../../lib/liveSession'
import type { Level, StudentProgress } from '../../types'
import { FullPageMessage } from '../auth/ProtectedRoute'
import { useSessions } from '../sessions/sessionsContext'
import { StudentProgressRow } from './StudentProgressRow'
import { students } from '../class/students'
import { initialProgress } from './mockData'
import { sessionCrumbs } from '../sessions/crumbs'
import { PageBreadcrumbs } from '../../components/layout/PageBreadcrumbs'

// Simulerer elevene til sanntidsdata fra Firestore er på plass.
const SIMULATION_INTERVAL_MS = 4000

const clock = (date: Date) =>
  date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')

export function LiveSessionPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const { sessions, getTasks, complete } = useSessions()
  const { profile } = useAuth()
  const session = sessions.find((s) => s.id === sessionId)
  const tasks = getTasks(sessionId)

  // Antall oppgaver per nivå ligger fast mens økta pågår.
  const [totals] = useState<Record<Level, number>>(() => ({
    1: tasks.filter((t) => t.level === 1).length,
    2: tasks.filter((t) => t.level === 2).length,
    3: tasks.filter((t) => t.level === 3).length,
  }))
  const totalFor = (level: Level) => totals[level]

  const [progress, setProgress] = useState<Record<string, StudentProgress>>(() =>
    Object.fromEntries(
      students.map((s) => {
        const p = initialProgress[s.id] ?? { started: false, done: 0 }
        return [s.id, p.done < 0 ? { started: true, done: totalFor(s.level) } : p]
      }),
    ),
  )
  const [paused, setPaused] = useState(false)
  const [startedAt] = useState(() => new Date())
  const [updatedAt, setUpdatedAt] = useState(() => new Date())

  useEffect(() => {
    if (paused) return
    const timer = setInterval(() => {
      setProgress((prev) => {
        const active = students.filter((s) => prev[s.id].done < totals[s.level])
        if (active.length === 0) return prev
        const student = active[Math.floor(Math.random() * active.length)]
        const current = prev[student.id]
        const next = current.started ? { started: true, done: current.done + 1 } : { started: true, done: 0 }
        return { ...prev, [student.id]: next }
      })
      setUpdatedAt(new Date())
    }, SIMULATION_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [paused, totals])

  if (!session) return <FullPageMessage text="Fant ikke økten." />

  const counts = students.reduce(
    (acc, s) => {
      const p = progress[s.id]
      if (p.done >= totalFor(s.level)) acc.finished += 1
      else if (p.started) acc.working += 1
      else acc.notStarted += 1
      return acc
    },
    { notStarted: 0, working: 0, finished: 0 },
  )

  const stats: { icon: LucideIcon; value: number; label: string }[] = [
    { icon: Clock3, value: counts.notStarted, label: 'Ikke startet' },
    { icon: PencilLine, value: counts.working, label: 'Jobber nå' },
    { icon: CircleCheck, value: counts.finished, label: 'Har fullført' },
  ]

  const columns = [0, 1, 2].map((i) => students.slice(i * 6, i * 6 + 6))

  const togglePause = () => {
    const next = !paused
    setPaused(next)
    void setLiveStatus(liveClassId(profile?.classId, session.className), next ? 'paused' : 'running')
  }

  const endSession = () => {
    void endLiveSession(liveClassId(profile?.classId, session.className))
    complete(session.id)
    navigate(`/okt/${session.id}`)
  }

  return (
    <div className="flex max-w-[1109px] flex-col gap-7">
      <div className="flex flex-col gap-6">
        <PageBreadcrumbs items={[...sessionCrumbs(session), { label: 'Følg elevenes arbeid' }]} />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-h1 text-primary">Følg elevenes arbeid</h1>
            <p className="text-base text-secondary">
              {session.title} · Klasse {session.className} · {tasks.length} oppgaver
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={endSession}
              className="h-12 cursor-pointer rounded-lg border-[0.5px] border-neutral-400 bg-background px-5 text-body text-primary hover:bg-neutral-100"
            >
              Avslutt økt
            </button>
            <button
              type="button"
              onClick={togglePause}
              className="flex h-12 cursor-pointer items-center justify-center gap-6 px-5 rounded-lg border border-on-primary bg-primary text-lg font-medium text-on-primary drop-shadow-[0_4px_6px_rgba(36,58,95,0.2)] hover:bg-primary/90"
            >
              {paused ? 'Fortsett økt' : 'Pause økt'}
              {paused ? (
                <PlayIcon />
              ) : (
                <span className="relative size-6" aria-hidden>
                  <span className="absolute top-1.5 left-1 h-3 w-1 rounded-[1px] bg-on-primary" />
                  <span className="absolute top-1.5 left-4 h-3 w-1 rounded-[1px] bg-on-primary" />
                </span>
              )}
            </button>
          </div>
        </div>

        <div role="status" className="flex items-center justify-between rounded-lg bg-tertiary px-[18px] py-3.5 text-small">
          <div className="flex items-center gap-2.5">
            <span className={`size-2 rounded-full ${paused ? 'bg-needs-support' : 'bg-understanding'}`} aria-hidden />
            <span className="font-medium text-primary">{paused ? 'Økten er satt på pause' : 'Økten er i gang'}</span>
            <span className="text-secondary">Startet kl. {clock(startedAt)}</span>
          </div>
          <span className="text-secondary">Sist oppdatert kl. {clock(updatedAt)}</span>
        </div>
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
            <p className="text-small text-secondary">Se hvor langt elevene har kommet, og hvem som trenger deg.</p>
          </div>
          <p className="text-small text-secondary">{students.length} elever</p>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {columns.map((column, i) => (
            <ul key={i} className="overflow-hidden rounded-lg bg-background">
              {column.map((student) => (
                <StudentProgressRow
                  key={student.id}
                  student={student}
                  progress={progress[student.id]}
                  total={totalFor(student.level)}
                />
              ))}
            </ul>
          ))}
        </div>
      </section>
    </div>
  )
}
