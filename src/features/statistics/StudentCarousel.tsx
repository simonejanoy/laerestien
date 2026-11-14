import { Search, User } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type Ref } from 'react'
import { Link } from 'react-router-dom'
import type { Student } from '../../types'

const PAGE_SIZE = 8

/** Blaingen: rask og rolig, med myk start og slutt. */
const SLIDE_MS = 300
const SLIDE_EASING = 'cubic-bezier(0.33, 0, 0.2, 1)'
/** Med «redusert bevegelse»: bare en kort fade, ingen gliding. */
const FADE_MS = 150

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const shortName = (name: string) => {
  const [first, last] = name.split(' ')
  return last ? `${first} ${last[0]}.` : first
}

/** «Elever (18)» med søk og bla-knapper. Trykk på en elev for å se statistikken. */
export function StudentCarousel({ students, activeId }: { students: Student[]; activeId?: string }) {
  // Start på siden der den valgte eleven er, så den er synlig i lista.
  const [page, setPage] = useState(() => {
    const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name, 'nb'))
    return Math.max(0, Math.floor(sorted.findIndex((s) => s.id === activeId) / PAGE_SIZE))
  })
  // Siden som glir ut mens den nye glir inn (1 = «Neste», −1 = «Forrige»), og en teller som starter hver blaing.
  const [leaving, setLeaving] = useState<{ page: number; direction: 1 | -1; turn: number } | null>(null)
  // Sperre mens animasjonen går, så et nytt trykk midt i ikke kan sette sidene i feil rekkefølge.
  const animating = useRef(false)
  const incomingRef = useRef<HTMLUListElement>(null)
  const outgoingRef = useRef<HTMLUListElement>(null)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = students
    .filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const pageOf = (n: number) => filtered.slice(n * PAGE_SIZE, n * PAGE_SIZE + PAGE_SIZE)
  const visible = pageOf(current)

  const turnTo = (next: number, direction: 1 | -1) => {
    if (animating.current || next < 0 || next >= pageCount) return
    animating.current = true
    setLeaving((prev) => ({ page: current, direction, turn: (prev?.turn ?? 0) + 1 }))
    setPage(next)
  }

  // Den nye siden glir inn fra høyre («Neste») eller venstre («Forrige»), og den gamle glir ut motsatt vei.
  // Begge ligger oppå hverandre i samme rute, så høyden står stille.
  useLayoutEffect(() => {
    if (!leaving) return
    const incoming = incomingRef.current
    const outgoing = outgoingRef.current
    const done = () => {
      animating.current = false
      setLeaving(null)
    }
    if (!incoming || typeof incoming.animate !== 'function') return done()
    const shift = (sign: number) => `translateX(${sign * 100}%)`
    const animations = prefersReducedMotion()
      ? [
          incoming.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' }),
          ...(outgoing ? [outgoing.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS / 2, easing: 'ease-out', fill: 'forwards' })] : []),
        ]
      : [
          incoming.animate([{ transform: shift(leaving.direction) }, { transform: shift(0) }], { duration: SLIDE_MS, easing: SLIDE_EASING }),
          ...(outgoing
            ? [outgoing.animate([{ transform: shift(0) }, { transform: shift(-leaving.direction) }], { duration: SLIDE_MS, easing: SLIDE_EASING, fill: 'forwards' })]
            : []),
        ]
    let cancelled = false
    Promise.all(animations.map((a) => a.finished))
      .catch(() => {})
      .then(() => !cancelled && done())
    return () => {
      // Sperren slippes først når en animasjon er ferdig (done), ikke her – React kan kjøre effekten to ganger.
      cancelled = true
      animations.forEach((a) => a.cancel())
    }
    // Én gang per blaing: `leaving` er et nytt objekt for hver blaing, og null når den er ferdig.
  }, [leaving])

  const navButton = (enabled: boolean) =>
    `flex size-10 items-center justify-center rounded-full border border-surface text-h3 ${
      enabled ? 'cursor-pointer bg-primary text-on-primary' : 'bg-background text-secondary'
    }`

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-h3 text-on-background">Elever ({students.length})</h2>
        <button
          type="button"
          aria-label="Søk etter elev"
          onClick={() => setSearching((s) => !s)}
          className="ml-2 cursor-pointer text-primary"
        >
          <Search className="size-6" />
        </button>
        {searching && (
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
            placeholder="Søk etter navn"
            aria-label="Søk etter navn"
            className="rounded-lg border border-surface bg-background px-3 py-1.5 text-small text-primary outline-none focus:border-secondary"
          />
        )}
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Forrige elever"
          disabled={current === 0}
          onClick={() => turnTo(current - 1, -1)}
          className={navButton(current > 0)}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Neste elever"
          disabled={current >= pageCount - 1}
          onClick={() => turnTo(current + 1, 1)}
          className={navButton(current < pageCount - 1)}
        >
          ›
        </button>
      </div>

      {/*
        Sidene ligger oppå hverandre i samme rute: en usynlig full side holder høyden fast (også på siste side med færre
        elever), den gamle siden glir ut og den nye glir inn. Bare sideveis klipping, så fokusrammen ikke kuttes.
      */}
      <div className="-mx-1 grid overflow-x-clip px-1">
        <CardList students={filtered.slice(0, PAGE_SIZE)} activeId={activeId} className="invisible" hidden />
        {leaving && leaving.page !== current && (
          <CardList key={`ut-${leaving.turn}`} listRef={outgoingRef} students={pageOf(leaving.page)} activeId={activeId} className="pointer-events-none" hidden />
        )}
        <CardList key={`inn-${current}`} listRef={incomingRef} students={visible} activeId={activeId} empty={visible.length === 0} />
      </div>

      <div className="flex justify-center gap-1.5" aria-hidden>
        {Array.from({ length: pageCount }, (_, i) => (
          <span key={i} className={`h-2 rounded-full ${i === current ? 'w-[18px] bg-secondary' : 'w-2 bg-surface'}`} />
        ))}
      </div>
    </section>
  )
}

interface CardListProps {
  students: Student[]
  activeId?: string
  className?: string
  /** Bare til utseendet (siden som glir ut, eller den som holder høyden): skjult for skjermlesere og tastatur. */
  hidden?: boolean
  empty?: boolean
  listRef?: Ref<HTMLUListElement>
}

/** Én side med elevkort. */
function CardList({ students, activeId, className = '', hidden = false, empty = false, listRef }: CardListProps) {
  return (
    <ul ref={listRef} aria-hidden={hidden || undefined} inert={hidden || undefined} className={`col-start-1 row-start-1 flex flex-wrap content-start gap-3 p-1 ${className}`}>
      {students.map((student) => {
        const active = student.id === activeId
        return (
          <li key={student.id} className="w-[124px] shrink-0">
            <Link
              to={`/statistikk/elev/${student.id}`}
              aria-current={active ? 'page' : undefined}
              className="group flex flex-col gap-2 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              {/* Rammen ligger inne i elementet, så den ikke klippes. Gjennomsiktig når ikke valgt. */}
              <span className={`rounded-lg border-4 p-0.5 ${active ? 'border-primary' : 'border-transparent'}`}>
                {student.photo ? (
                  <img src={student.photo} alt="" className="size-[108px] rounded object-cover object-top" />
                ) : (
                  <span className="flex size-[108px] items-center justify-center rounded bg-surface-variant text-primary transition-colors group-hover:bg-surface">
                    <User className="size-[80px]" strokeWidth={1} />
                  </span>
                )}
              </span>
              <span className={`truncate px-1 text-body text-black group-hover:underline ${active ? 'font-semibold' : ''}`}>
                {shortName(student.name)}
              </span>
            </Link>
          </li>
        )
      })}
      {empty && <li className="text-small text-secondary">Ingen elever heter det.</li>}
    </ul>
  )
}
