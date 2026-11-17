import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useNow } from '../../hooks/useNow'
import { sessionLabel, useSessions } from '../sessions/sessionsContext'
import { effectiveStatus } from './liveProgress'
import { useLiveSession } from './useLiveSession'

/**
 * På lærerens oversikt: økta som er i gang (eller på pause) for elevene i klassen akkurat nå. Elevene ser oppgavene
 * fra denne økta, så læreren skal alltid kunne se det – og gå til den for å følge med eller avslutte den.
 */
export function ActiveSessionBanner() {
  const { profile } = useAuth()
  const { sessions } = useSessions()
  const { live } = useLiveSession(profile?.classId ?? null)
  const status = effectiveStatus(live, useNow(30_000).getTime())
  if (!live || (status !== 'running' && status !== 'paused')) return null
  const session = sessions.find((s) => s.id === live.sessionId)
  const name = live.label ?? (session ? `${session.title} økt ${sessionLabel(session)}` : 'En økt')

  return (
    <div role="status" data-testid="aktiv-okt" className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg bg-tertiary px-[18px] py-3.5 text-small">
      <span className="flex items-center gap-2.5">
        <span className={`size-2 rounded-full ${status === 'running' ? 'bg-understanding' : 'bg-needs-support'}`} aria-hidden />
        <span className="font-medium text-primary">
          {name} {status === 'running' ? 'er i gang' : 'er satt på pause'} for elevene
        </span>
      </span>
      <Link to={`/okt/${live.sessionId}/live`} className="text-primary underline">
        Følg elevenes arbeid
      </Link>
    </div>
  )
}
