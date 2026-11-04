import type { Crumb } from '../../components/ui/Breadcrumbs'
import type { Session } from '../../types'
import { unitById } from '../topics/mockData'
import { sessionLabel } from './sessionsContext'

/** «Alle tema › Addisjon og subtraksjon › Økt 3» for en økt. Sett `current` når økta er siste ledd. */
export function sessionCrumbs(session: Session, current = false): Crumb[] {
  const topicName = unitById(session.topicId)?.name ?? session.topic
  return [
    { label: 'Alle tema', to: '/tema' },
    { label: topicName, to: `/tema/${session.topicId}` },
    { label: `Økt ${sessionLabel(session)}`, to: current ? undefined : `/okt/${session.id}` },
  ]
}
