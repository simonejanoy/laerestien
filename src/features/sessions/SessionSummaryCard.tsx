import { Fragment } from 'react'
import { ProgressBar } from '../../components/ui/ProgressBar'
import type { Session } from '../../types'

/** «Økt oversikt»: Tema | tema | (Dobbeltøkt) og framdrift i temaet. */
export function SessionSummaryCard({ session }: { session: Session }) {
  const current = session.numbers[session.numbers.length - 1]
  const items = ['Tema', session.topic, ...(session.numbers.length > 1 ? ['Dobbeltøkt'] : [])]

  return (
    <div className="flex flex-col items-center gap-5 rounded-[7px] bg-surface px-10 py-[30px] drop-shadow-[0_2px_2px_rgba(0,0,0,0.17)]">
      <div className="flex items-center gap-5 text-body text-on-surface">
        {items.map((item, i) => (
          <Fragment key={item}>
            {i > 0 && <span className="h-10 w-px bg-secondary" aria-hidden />}
            <span>{item}</span>
          </Fragment>
        ))}
      </div>
      <div className="flex items-center gap-3.5 text-small text-on-surface">
        <span>
          Økt {current} av {session.totalSessions}
        </span>
        <ProgressBar
          value={current}
          max={session.totalSessions}
          label="Økter i temaet"
          className="h-[9px] w-[120px] px-px"
        />
      </div>
    </div>
  )
}
