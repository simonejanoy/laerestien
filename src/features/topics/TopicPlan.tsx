import { CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PlanWeek } from '../../types'

interface TopicPlanProps {
  weeks: PlanWeek[]
  /** Lenke til økt nummer n, hvis økta finnes. */
  linkFor: (sessionNumber: number) => string | undefined
}

/** «Plan»: uker med øktene sine, med en tynn linje mellom ukene. */
export function TopicPlan({ weeks, linkFor }: TopicPlanProps) {
  // Første øktnummer i hver uke (øktene nummereres fortløpende gjennom temaet).
  const firstNumber = weeks.map((_, i) => 1 + weeks.slice(0, i).reduce((sum, w) => sum + w.sessions.length, 0))

  return (
    <section className="flex flex-col gap-[15px] rounded-lg bg-surface-light p-5">
      <h2 className="flex items-center gap-2.5 text-h3 text-primary">
        <CalendarDays className="size-6" />
        Plan
      </h2>
      <ol className="relative flex flex-col gap-2.5">
        <span className="absolute top-4 bottom-[64px] left-[2.5px] w-px bg-surface" aria-hidden />
        {weeks.map((week, weekIndex) => (
          <li key={week.title} className="flex flex-col gap-[5px]">
            <div className="flex items-center gap-[31px] text-body text-black">
              <span className="relative size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              {week.title}
            </div>
            <ul className="flex flex-col gap-2.5 pl-[53px] text-small text-secondary">
              {week.sessions.map((title, i) => {
                const sessionNumber = firstNumber[weekIndex] + i
                const to = linkFor(sessionNumber)
                const label = `Økt ${sessionNumber}: ${title}`
                return (
                  <li key={label}>
                    {to ? (
                      <Link to={to} className="hover:text-primary hover:underline">
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}
