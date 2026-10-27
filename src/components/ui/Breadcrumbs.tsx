import { ChevronRight } from 'lucide-react'
import { Fragment } from 'react'
import { Link } from 'react-router-dom'

export interface Crumb {
  label: string
  to?: string
}

/** «Alle tema › De fire regneartene › Addisjon» – siste ledd er gjeldende side. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Brødsmuler" className="flex items-center gap-2 text-small leading-normal">
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <Fragment key={item.label}>
            {i > 0 && <ChevronRight className="size-3.5 text-primary" strokeWidth={2.4} aria-hidden />}
            {isLast || !item.to ? (
              <span className={isLast ? 'text-primary' : 'text-secondary'} aria-current={isLast ? 'page' : undefined}>
                {item.label}
              </span>
            ) : (
              <Link to={item.to} className="text-secondary hover:underline">
                {item.label}
              </Link>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
