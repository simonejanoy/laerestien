import { Search, User } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Student } from '../../types'

const PAGE_SIZE = 8

const shortName = (name: string) => {
  const [first, last] = name.split(' ')
  return last ? `${first} ${last[0]}.` : first
}

/** «Elever (18)» med søk og bla-knapper. Trykk på en elev for å se statistikken. */
export function StudentCarousel({ students, activeId }: { students: Student[]; activeId?: string }) {
  const [page, setPage] = useState(0)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = students
    .filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

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
          onClick={() => setPage(current - 1)}
          className={navButton(current > 0)}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Neste elever"
          disabled={current >= pageCount - 1}
          onClick={() => setPage(current + 1)}
          className={navButton(current < pageCount - 1)}
        >
          ›
        </button>
      </div>

      <ul className="flex flex-wrap gap-3 p-1">
        {visible.map((student) => {
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
        {visible.length === 0 && <li className="text-small text-secondary">Ingen elever heter det.</li>}
      </ul>

      <div className="flex justify-center gap-1.5" aria-hidden>
        {Array.from({ length: pageCount }, (_, i) => (
          <span key={i} className={`h-2 rounded-full ${i === current ? 'w-[18px] bg-secondary' : 'w-2 bg-surface'}`} />
        ))}
      </div>
    </section>
  )
}
