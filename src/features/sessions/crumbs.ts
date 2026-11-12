import type { Crumb } from '../../components/ui/Breadcrumbs'
import type { Session } from '../../types'
import { describeSlots } from '../calendar/mockData'
import { unitById } from '../topics/mockData'
import { sessionLabel } from './sessionsContext'

/**
 * Når økta er planlagt: «Mandag 9. november · kl. 8.30 - 10.30». Regnes ut fra uka og timene i timeplanen,
 * så det stemmer også etter at økta er flyttet.
 */
export function sessionWhen(session: Session) {
  if (session.slots.length === 0) return null
  const { date, time } = describeSlots(session, session.slots)
  return `${date} · kl. ${time}`
}

/** «Alle tema › Addisjon og subtraksjon › Økt 3» for en økt. Sett `current` når økta er siste ledd. */
export function sessionCrumbs(session: Session, current = false): Crumb[] {
  const topicName = unitById(session.topicId)?.name ?? session.topic
  return [
    { label: 'Alle tema', to: '/tema' },
    { label: topicName, to: `/tema/${session.topicId}` },
    { label: `Økt ${sessionLabel(session)}`, to: current ? undefined : `/okt/${session.id}` },
  ]
}
