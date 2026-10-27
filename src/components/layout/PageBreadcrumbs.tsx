import { useAuth } from '../../hooks/useAuth'
import { Breadcrumbs, type Crumb } from '../ui/Breadcrumbs'

interface PageBreadcrumbsProps {
  /** Leddene etter «Oversikt» (og eventuelt klassen). Det siste er gjeldende side. */
  items?: Crumb[]
  /** Ta med «Klasse 4A» (lenke til elevlisten) etter «Oversikt». */
  inClass?: boolean
}

/** Brødsmuler øverst på lærersidene, alltid med «Oversikt» først. */
export function PageBreadcrumbs({ items = [], inClass = false }: PageBreadcrumbsProps) {
  const { profile } = useAuth()
  const classId = profile?.classId ?? '4A'

  return (
    <Breadcrumbs
      items={[
        { label: 'Oversikt', to: '/' },
        ...(inClass ? [{ label: `Klasse ${classId}`, to: '/elever' }] : []),
        ...items,
      ]}
    />
  )
}
