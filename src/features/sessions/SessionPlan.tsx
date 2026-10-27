import { CalendarDays } from 'lucide-react'
import type { PlanItem } from '../../types'

/** «Øktplan»: punktliste med en tynn linje mellom punktene. */
export function SessionPlan({ items }: { items: PlanItem[] }) {
  return (
    <section className="flex flex-1 flex-col gap-[15px] rounded-lg bg-surface-light p-5">
      <h3 className="flex items-center gap-2.5 text-h3 text-primary">
        <CalendarDays className="size-6" />
        Øktplan
      </h3>
      <ol className="relative flex flex-col gap-2.5">
        <span className="absolute top-4 bottom-[34px] left-[2.5px] w-px bg-surface" aria-hidden />
        {items.map((item) => (
          <li key={item.title}>
            <div className="flex items-center gap-[31px] text-body text-black">
              <span className="relative size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              {item.title} - {item.minutes} min
            </div>
            <p className="pl-[53px] text-small text-black/50">{item.description}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
