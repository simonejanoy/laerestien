import { Flower, LeafyGreen, Snowflake, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Term } from '../../types'

const termIcons: Record<Term['id'], LucideIcon> = {
  host: LeafyGreen,
  vinter: Snowflake,
  var: Flower,
}

/** Én periode i årsplanen (Høst/Vinter/Vår) med temaene sine. */
export function TermBlock({ term }: { term: Term }) {
  const Icon = termIcons[term.id]

  return (
    <section className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface-light px-6 py-3">
      <div className="flex items-start justify-between gap-4">
        <h2 className="flex items-center gap-[5px] text-h2 text-on-tertiary">
          <Icon className="size-6" />
          {term.name}
        </h2>
        <p className="text-small text-black/50">{term.period}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {term.topics.map((topic) => (
          <li key={topic.id}>
            <Link
              to={`/tema/${topic.id}`}
              className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-2.5 text-body transition-colors hover:bg-surface-light"
            >
              <span className="text-foreground">{topic.name}</span>
              <span className="text-black/50">{topic.weeks} uker</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
