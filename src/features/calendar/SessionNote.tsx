import { CircleCheck, EllipsisVertical, PencilLine, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CalendarSession } from '../../types'

interface SessionNoteProps {
  session: CalendarSession
  onEdit: (sessionId: string) => void
  onRemove: (sessionId: string) => void
  /** Åpne menyen oppover (nederste rad i kalenderen). */
  openUp?: boolean
}

const menuItem =
  'flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left text-small hover:bg-surface-light focus-visible:bg-surface-light focus-visible:outline-none'

// Fullførte økter er grå (text-insufficient gir 5.2:1 mot neutral-100) og har hake – ikke bare annen farge.
const noteStyle = {
  upcoming:
    'bg-surface-variant text-on-surface-variant shadow-[0_4px_4px_rgba(0,0,0,0.25)] transition-transform hover:-translate-y-0.5',
  completed: 'border border-neutral-500 bg-neutral-100 text-insufficient hover:underline',
}

/**
 * Gul lapp for en økt i kalenderen («matteøkt kort» i Figma), med ⋮-meny for å endre eller fjerne.
 * Økter som er over, vises grå med hake, men kan fortsatt åpnes.
 */
export function SessionNote({ session, onEdit, onRemove, openUp = false }: SessionNoteProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Lukk menyen ved klikk utenfor eller Escape.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (action: (id: string) => void) => {
    setOpen(false)
    action(session.sessionId)
  }

  return (
    <div ref={ref} className="relative w-full max-w-[8.75rem]">
      <Link
        to={`/okt/${session.sessionId}`}
        className={`flex flex-col gap-0.5 rounded py-1 pr-8 pl-2 text-small focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          session.completed ? noteStyle.completed : noteStyle.upcoming
        }`}
      >
        <span>{session.topic}</span>
        <span className="border-t-[0.5px] border-current" aria-hidden />
        <span>
          økt. {session.sessionNumber}
          {session.completed && <span className="sr-only">, fullført</span>}
        </span>
        {session.completed && (
          <CircleCheck className="absolute right-1.5 bottom-1 size-4" strokeWidth={2.2} aria-hidden />
        )}
      </Link>

      <button
        type="button"
        aria-label={`Valg for økt ${session.sessionNumber}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`absolute top-0.5 right-0.5 flex size-7 cursor-pointer items-center justify-center rounded hover:bg-on-surface-variant/10 focus-visible:outline-2 focus-visible:outline-primary ${
          session.completed ? 'text-insufficient' : 'text-on-surface-variant'
        }`}
      >
        <EllipsisVertical className="size-5" />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 z-20 w-44 rounded-lg border border-surface bg-background p-1 text-on-background shadow-lg ${
            openUp ? 'bottom-full mb-1' : 'top-8'
          }`}
        >
          <button type="button" role="menuitem" autoFocus onClick={() => choose(onEdit)} className={menuItem}>
            <PencilLine className="size-4" aria-hidden />
            Rediger økt
          </button>
          <button type="button" role="menuitem" onClick={() => choose(onRemove)} className={`${menuItem} text-error`}>
            <Trash2 className="size-4" aria-hidden />
            Fjern økt
          </button>
        </div>
      )}
    </div>
  )
}
