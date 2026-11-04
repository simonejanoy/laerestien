import { PencilLine } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DeleteSessionDialog } from '../sessions/DeleteSessionDialog'
import { SessionFormDialog } from '../sessions/SessionFormDialog'
import { useSessions } from '../sessions/sessionsContext'
import { SessionOverviewCard } from './SessionOverviewCard'
import { WeekCalendar } from './WeekCalendar'
import { breaks, currentWeek, hasEnded, timeSlots, weekdays } from './mockData'
import { useNow } from '../../hooks/useNow'
import { PageBreadcrumbs } from '../../components/layout/PageBreadcrumbs'

export function HomePage() {
  const navigate = useNavigate()
  const { sessions, calendarEntries, getStatus, addSession, updateSession, removeSession } = useSessions()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const editing = sessions.find((s) => s.id === editingId)
  const removing = sessions.find((s) => s.id === removingId)
  const [week, setWeek] = useState(currentWeek.week)
  const [creating, setCreating] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const created = sessions.find((s) => s.id === createdId)
  const now = useNow()

  // Alt under regnes ut fra øktene, så kalenderen oppdaterer seg når økter legges til, endres eller fjernes.
  const weekSessionIds = new Set(sessions.filter((s) => s.week === week).map((s) => s.id))
  const weekEntries = calendarEntries
    .filter((e) => weekSessionIds.has(e.sessionId))
    .map((e) => ({
      ...e,
      completed: hasEnded(week, e.day, e.time, now) || getStatus(e.sessionId) === 'completed',
    }))
  const topicSessions = sessions.filter((s) => s.topicId === sessions[0]?.topicId)
  const completed = topicSessions
    .filter((s) => getStatus(s.id) === 'completed')
    .reduce((n, s) => n + s.numbers.length, 0)
  const nextSession = topicSessions.find((s) => getStatus(s.id) !== 'completed')

  return (
    <div className="flex max-w-[1061px] flex-col items-start gap-5">
      <PageBreadcrumbs />
      <h1 className="text-h1 text-on-background">Matematikk - 4A</h1>

      {topicSessions[0] && (
        <SessionOverviewCard
          dateLabel={currentWeek.dateLabel}
          week={topicSessions[0].week}
          topic={topicSessions[0].topic}
          completedSessions={completed}
          totalSessions={topicSessions[0].totalSessions}
          onNextSession={() => nextSession && navigate(`/okt/${nextSession.id}`)}
        />
      )}

      <div className="w-full">
        <WeekCalendar
          week={week}
          weekdays={weekdays}
          timeSlots={timeSlots}
          breaks={breaks}
          sessions={weekEntries}
          now={now}
          onPreviousWeek={() => setWeek((w) => w - 1)}
          onNextWeek={() => setWeek((w) => w + 1)}
          onAdd={() => setCreating(true)}
          onEditSession={setEditingId}
          onRemoveSession={setRemovingId}
        />
      </div>

      {created && (
        <p role="status" className="rounded-lg bg-level2-surface px-4 py-2.5 text-small text-on-surface">
          Ny økt lagt til {created.date?.toLowerCase()} kl. {created.time}.{' '}
          <Link to={`/okt/${created.id}`} className="underline">
            Gå til økta
          </Link>
        </p>
      )}

      {creating && (
        <SessionFormDialog
          open
          onClose={() => setCreating(false)}
          onSave={(input) => {
            setCreatedId(addSession(input))
            setCreating(false)
          }}
        />
      )}

      {editing && (
        <SessionFormDialog
          open
          session={editing}
          onClose={() => setEditingId(null)}
          onSave={(input) => {
            updateSession(editing.id, input)
            setEditingId(null)
          }}
        />
      )}

      {removing && (
        <DeleteSessionDialog
          session={removing}
          onCancel={() => setRemovingId(null)}
          onConfirm={() => {
            removeSession(removing.id)
            setRemovingId(null)
            if (createdId === removing.id) setCreatedId(null)
          }}
        />
      )}

      <button
        type="button"
        onClick={() => navigate('/tema')}
        className="flex cursor-pointer items-center gap-[15px] rounded border border-surface p-2.5 text-small text-primary hover:bg-surface-light"
      >
        <PencilLine className="size-5" />
        {currentWeek.topicSpan}
      </button>
    </div>
  )
}
