import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export interface Crumb {
  label: string
  to?: string
}

/** «Oversikt › Alle tema › Addisjon» – alle ledd unntatt det siste er lenker. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Brødsmuler">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small leading-normal">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="size-3.5 text-primary" strokeWidth={2.4} aria-hidden />}
              {isLast || !item.to ? (
                <span className="font-medium text-primary" aria-current={isLast ? 'page' : undefined}>
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.to}
                  className="text-secondary underline decoration-secondary/40 underline-offset-2 hover:text-primary hover:decoration-primary"
                >
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
