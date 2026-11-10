import type { ReactNode } from 'react'
import paper from '../../assets/student/ruteark.png'
import board from '../../assets/student/tavle.png'

interface StudentLayoutProps {
  /** Vises etter «Lærestien /», f.eks. «Addisjon økt 4». */
  label?: string
  /** Ruteark i vanlig visning, mørk tavle når læreren har pause. */
  background?: 'paper' | 'board'
  /** Uten denne vises ikke «Logg ut» (brukes i lærerens forhåndsvisning). */
  onLogout?: () => void
  /** Inne i lærerens forhåndsvisning: fyller rammen den ligger i i stedet for hele skjermen. */
  embedded?: boolean
  children: ReactNode
}

export function StudentLayout({ label, background = 'paper', onLogout, embedded = false, children }: StudentLayoutProps) {
  return (
    <div className={`relative flex flex-col ${embedded ? 'flex-1' : 'min-h-screen'}`}>
      <img
        src={background === 'board' ? board : paper}
        alt=""
        className="pointer-events-none absolute inset-0 size-full object-cover"
      />
      {background === 'paper' && (
        <div className="pointer-events-none absolute inset-x-0 top-[173px] bottom-0 bg-linear-to-b from-cream to-transparent" />
      )}

      <header className="relative flex h-[88px] items-center justify-between border-b border-rule bg-background px-20">
        <div className="flex items-center gap-3">
          <span className="text-[23px] text-primary">Lærestien</span>
          {label && (
            <>
              <span className="text-2xl text-secondary" aria-hidden>
                /
              </span>
              <span className="text-body text-muted">{label}</span>
            </>
          )}
        </div>
        {onLogout && (
          <button type="button" onClick={onLogout} className="cursor-pointer text-small text-muted hover:underline">
            Logg ut
          </button>
        )}
      </header>

      <main className="relative flex flex-1 flex-col">{children}</main>
    </div>
  )
}
