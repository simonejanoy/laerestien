import { Target } from 'lucide-react'

/** «Mål for tema»: hvit boks med gul liste. */
export function TopicGoals({ goals }: { goals: string[] }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-surface bg-background p-5">
      <h2 className="flex items-center gap-2.5 text-h3 text-on-background">
        <Target className="size-6 text-goal" />
        Mål for tema
      </h2>
      <ol className="flex list-decimal flex-col gap-3 rounded-lg bg-surface-variant p-4 ps-[37px] text-small text-primary">
        {goals.map((goal) => (
          <li key={goal}>{goal}</li>
        ))}
      </ol>
    </section>
  )
}
