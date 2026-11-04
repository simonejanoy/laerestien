import { ChevronLeft, ChevronRight, CirclePlus } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { CalendarSession, Weekday } from '../../types'
import { dateOf, endOf, isSameDate, minutesOf } from './mockData'
import { SessionNote } from './SessionNote'

interface WeekCalendarProps {
  week: number
  weekdays: Weekday[]
  timeSlots: string[]
  breaks: Record<string, string>
  sessions: CalendarSession[]
  /** Nåtiden – brukes til nåtidslinjen. */
  now: Date
  onPreviousWeek: () => void
  onNextWeek: () => void
  onAdd: () => void
  onEditSession: (sessionId: string) => void
  onRemoveSession: (sessionId: string) => void
}

const cell = 'border-t border-r border-secondary bg-calendar-background'
const timeCell = `${cell} flex w-12 shrink-0 items-center justify-center border-l text-small text-secondary`

export function WeekCalendar({
  week,
  weekdays,
  timeSlots,
  breaks,
  sessions,
  now,
  onPreviousWeek,
  onNextWeek,
  onAdd,
  onEditSession,
  onRemoveSession,
}: WeekCalendarProps) {
  const findSession = (day: Weekday, time: string) => sessions.find((s) => s.day === day && s.time === time)

  // Nåtidslinjen: hvilken kolonne som er i dag, og hvor langt ned i raden vi er kommet (0–100 %).
  const todayIndex = weekdays.findIndex((day) => isSameDate(dateOf(week, day), now))
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowLabel = `${now.getHours()}.${String(now.getMinutes()).padStart(2, '0')}`
  const nowOffset = (time: string) => {
    if (todayIndex < 0) return null
    const start = minutesOf(time)
    const end = minutesOf(endOf(time))
    return nowMinutes >= start && nowMinutes < end ? ((nowMinutes - start) / (end - start)) * 100 : null
  }

  return (
    <section className="flex w-full flex-col">
      <div className="flex h-9 items-center justify-between px-[5px] text-body text-primary">
        <div className="flex items-center gap-[5px]">
          <button type="button" onClick={onPreviousWeek} aria-label="Forrige uke" className="cursor-pointer">
            <ChevronLeft className="size-6" />
          </button>
          <span className="px-1">uke {week}</span>
          <button type="button" onClick={onNextWeek} aria-label="Neste uke" className="cursor-pointer">
            <ChevronRight className="size-6" />
          </button>
        </div>
        <button type="button" onClick={onAdd} className="flex cursor-pointer items-center gap-[5px]">
          Legg til
          <CirclePlus className="size-5" />
        </button>
      </div>

      {/* Bare rutenettet ruller sidelengs på smale skjermer – uke-navigasjon og «Legg til» blir stående. */}
      <div className="overflow-x-auto">
        <div className="flex min-w-[44rem] flex-col">
          <div className="flex h-9">
            <div className={`${cell} w-12 shrink-0 border-l`} />
            {weekdays.map((day) => (
              <div
                key={day}
                className="flex flex-1 items-center justify-center bg-secondary text-body text-on-secondary"
              >
                {day}
              </div>
            ))}
          </div>

          {timeSlots.map((time, rowIndex) => {
            const isLast = rowIndex === timeSlots.length - 1
            const breakLabel = breaks[time]
            const offset = nowOffset(time)

            if (breakLabel) {
              return (
                <div key={time} className="flex h-11">
                  <div className={timeCell}>{time}</div>
                  <div className="relative flex flex-1 items-center justify-center border-t border-r border-secondary bg-surface text-body text-primary">
                    {breakLabel}
                    {offset !== null && (
                      <NowLine
                        label={nowLabel}
                        style={{ top: `${offset}%`, left: `${todayIndex * (100 / weekdays.length)}%`, width: `${100 / weekdays.length}%` }}
                      />
                    )}
                  </div>
                </div>
              )
            }

            return (
              <div key={time} className="flex h-22">
                <div className={`${timeCell} ${isLast ? 'border-b' : ''}`}>{time}</div>
                {weekdays.map((day, dayIndex) => {
                  const session = findSession(day, time)
                  return (
                    <div
                      key={day}
                      className={`${cell} relative flex min-w-0 flex-1 items-center justify-center p-1.5 ${isLast ? 'border-b' : ''}`}
                    >
                      {offset !== null && dayIndex === todayIndex && (
                        <NowLine label={nowLabel} style={{ top: `${offset}%`, left: 0, right: 0 }} />
                      )}
                      {session && (
                        <SessionNote
                          session={session}
                          onEdit={onEditSession}
                          onRemove={onRemoveSession}
                          openUp={rowIndex >= timeSlots.length - 2}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/** Strek på tvers av dagens kolonne som viser hvor langt dagen har kommet. */
function NowLine({ label, style }: { label: string; style: CSSProperties }) {
  return (
    <div
      role="img"
      aria-label={`Nå, klokka ${label}`}
      style={style}
      className="pointer-events-none absolute z-10 flex -translate-y-1/2 items-center"
    >
      <span className="rounded-sm bg-primary px-1 text-xs leading-4 font-medium text-on-primary">Nå</span>
      <span className="h-0.5 flex-1 bg-primary" />
    </div>
  )
}
