import { Link } from 'react-router-dom'
import type { CalendarSession } from '../../types'

/** Gul lapp for en økt i kalenderen («matteøkt kort» i Figma). */
export function SessionNote({ session }: { session: CalendarSession }) {
  return (
    <Link
      to={`/okt/${session.sessionId}`}
      className="flex w-[140px] flex-col gap-1 rounded bg-surface-variant px-2 py-[5px] text-small text-on-surface-variant shadow-[0_4px_4px_rgba(0,0,0,0.25)] transition-transform hover:-translate-y-0.5"
    >
      <span>{session.topic}</span>
      <span className="border-t-[0.5px] border-on-surface-variant" aria-hidden />
      <span>økt. {session.sessionNumber}</span>
    </Link>
  )
}
