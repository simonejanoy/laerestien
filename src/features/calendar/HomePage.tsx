import { PencilLine } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SessionOverviewCard } from './SessionOverviewCard'
import { WeekCalendar } from './WeekCalendar'
import { breaks, currentWeek, sessions, timeSlots, weekdays } from './mockData'

export function HomePage() {
  const navigate = useNavigate()
  const [week, setWeek] = useState(currentWeek.week)
  const weekSessions = week === currentWeek.week ? sessions : []
  const nextSession = sessions.find((s) => s.sessionNumber === currentWeek.completedSessions + 1)

  return (
    <div className="flex max-w-[1061px] flex-col items-start gap-5">
      <h1 className="text-h1 text-on-background">Matematikk - 4A</h1>

      <SessionOverviewCard
        dateLabel={currentWeek.dateLabel}
        week={currentWeek.week}
        topic={currentWeek.topic}
        completedSessions={currentWeek.completedSessions}
        totalSessions={currentWeek.totalSessions}
        onNextSession={() => nextSession && navigate(`/okt/${nextSession.sessionId}`)}
      />

      <div className="w-full overflow-x-auto">
        <WeekCalendar
          week={week}
          weekdays={weekdays}
          timeSlots={timeSlots}
          breaks={breaks}
          sessions={weekSessions}
          onPreviousWeek={() => setWeek((w) => w - 1)}
          onNextWeek={() => setWeek((w) => w + 1)}
          onAdd={() => navigate('/tema')}
        />
      </div>

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
