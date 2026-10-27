import { Target } from 'lucide-react'

/** Gul «Målboks». */
export function SessionGoals({ title, goals }: { title: string; goals: string[] }) {
  return (
    <section className="flex flex-1 flex-col gap-[15px] self-stretch rounded-lg bg-surface-variant p-5 shadow-[0_5px_8px_rgba(0,0,0,0.25)]">
      <h3 className="flex items-center gap-2.5 pb-2.5 text-h3 text-on-surface-variant">
        <Target className="size-6 text-goal" />
        {title}
      </h3>
      <ol className="flex list-decimal flex-col gap-[15px] ps-6 text-body text-black">
        {goals.map((goal) => (
          <li key={goal}>{goal}</li>
        ))}
      </ol>
    </section>
  )
}
