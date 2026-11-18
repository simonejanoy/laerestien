import { ArrowRight, ChevronRight, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import type { MasteryStatus, Pattern, TopicMastery } from '../../types'
import { statusFill, statusLabel, statusText } from './statusStyles'

/** Lyseblå boks med skygge som brukes rundt alle statistikkdelene. */
export function StatPanel({
  title,
  small = false,
  className = '',
  children,
}: {
  title?: ReactNode
  /** Mindre overskrift (20px) – brukt på elevsiden. */
  small?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={`flex flex-col gap-4 rounded-lg bg-surface-light px-[15px] py-5 shadow-[2px_4px_4px_rgba(0,0,0,0.25)] ${className}`}
    >
      {title && <h2 className={`${small ? 'text-h3' : 'text-h2'} text-on-background`}>{title}</h2>}
      {children}
    </section>
  )
}

/** Åtte små blokker – fylte blokker viser hvor mye eleven/klassen mestrer. */
export function MasteryBar({ status, filled }: { status: MasteryStatus; filled: number }) {
  return (
    <span className="flex shrink-0 gap-0.5" role="img" aria-label={`${filled} av 8`}>
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          className={`h-[18px] w-[7px] rounded-[2px] ${i < filled ? statusFill[status] : 'border-[0.7px] border-insufficient'}`}
        />
      ))}
    </span>
  )
}

interface MasteryTableProps {
  rows: TopicMastery[]
  columns: [string, string, string]
  /** Gjør radene klikkbare (pil til høyre). */
  onSelect?: (row: TopicMastery) => void
}

/** Temaoversikt: tema + status, blokker og kommentar. */
export function MasteryTable({ rows, columns, onSelect }: MasteryTableProps) {
  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex gap-8 text-small text-secondary">
        <span className="w-[130px] shrink-0">{columns[0]}</span>
        <span className="w-[70px] shrink-0">{columns[1]}</span>
        <span>{columns[2]}</span>
      </div>
      <ul>
        {rows.map((row) => {
          const content = (
            <>
              <span className="flex w-[130px] shrink-0 flex-col gap-0.5 py-1">
                <span className="text-body text-on-background">{row.topic}</span>
                <span className={`text-small ${statusText[row.status]}`}>{row.label ?? statusLabel[row.status]}</span>
              </span>
              <MasteryBar status={row.status} filled={row.filled} />
              <span className="min-w-[140px] flex-1 text-small text-insufficient">{row.note}</span>
              {onSelect && <ChevronRight className="size-6 shrink-0 text-primary" />}
            </>
          )
          return (
            <li key={row.topic} className="border-b border-secondary/60">
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(row)}
                  className="flex w-full cursor-pointer items-center gap-8 py-1 text-left hover:bg-surface/50"
                >
                  {content}
                </button>
              ) : (
                <div className="flex items-center gap-8 py-1">{content}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * «Oppdaget mønster»: AI-tekst, sammenligning og et tips.
 * `reserveSpace` holder av to linjer til tekstene, så høyden ikke hopper når innholdet byttes ut.
 */
export function PatternContent({ pattern, reserveSpace = false }: { pattern: Pattern; reserveSpace?: boolean }) {
  return (
    <>
      <p
        className={`flex items-start gap-5 p-2.5 text-small text-on-background ${reserveSpace ? 'min-h-[calc(2lh+1.25rem)]' : ''}`}
      >
        <Sparkles className="size-6 shrink-0 text-primary" />
        {pattern.text}
      </p>
      <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-insufficient p-3">
        {pattern.compare.map((item, i) => (
          <div key={item.label} className="contents">
            {i > 0 && <ArrowRight className="size-6 shrink-0 text-primary" />}
            <div className="flex flex-1 flex-col rounded-lg bg-background p-[9px] text-small text-insufficient">
              <span>{item.label}</span>
              <span className="py-0.5 text-h3 text-on-background">{item.value}</span>
              <span>{item.caption}</span>
            </div>
          </div>
        ))}
      </div>
      <p className={`text-small text-black ${reserveSpace ? 'min-h-[2lh]' : ''}`}>{pattern.tip}</p>
    </>
  )
}

/** Tag med prikk, f.eks. «● Tallforståelse». */
export function DotTag({ tone, children }: { tone: 'good' | 'support'; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 self-start rounded-full py-1 pr-3 pl-2.5 text-small text-on-background ${
        tone === 'good' ? 'bg-level2-surface' : 'bg-surface-variant'
      }`}
    >
      <span className={`size-2 rounded-full ${tone === 'good' ? 'bg-understanding' : 'bg-needs-support'}`} aria-hidden />
      {children}
    </span>
  )
}
