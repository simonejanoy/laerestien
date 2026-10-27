import { ChevronRight } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ProgressBar } from '../../components/ui/ProgressBar'

interface SessionOverviewCardProps {
  dateLabel: string
  week: number
  topic: string
  completedSessions: number
  totalSessions: number
  onNextSession: () => void
}

export function SessionOverviewCard({
  dateLabel,
  week,
  topic,
  completedSessions,
  totalSessions,
  onNextSession,
}: SessionOverviewCardProps) {
  return (
    <section className="flex w-full max-w-[600px] flex-col gap-[5px]">
      <p className="text-small text-secondary">{dateLabel}</p>
      <div className="flex min-h-[120px] items-center justify-between gap-6 rounded-lg bg-surface px-7 py-[26px]">
        <div className="flex flex-col gap-[19px]">
          <div className="flex items-center gap-[19px] text-body text-on-surface">
            <span>Uke. {week}</span>
            <span className="h-10 w-px bg-secondary" aria-hidden />
            <span>{topic}</span>
          </div>
          <div className="flex items-center gap-[11px] text-small text-on-surface">
            <span>
              Økt {completedSessions} av {totalSessions} gjennomført
            </span>
            <ProgressBar
              value={completedSessions}
              max={totalSessions}
              label="Gjennomførte økter"
              className="h-[11px] w-[121px] px-0.5"
            />
          </div>
        </div>
        <Button variant="secondary" onClick={onNextSession} className="shrink-0">
          Gå til kommende økt
          <ChevronRight className="size-6" />
        </Button>
      </div>
    </section>
  )
}
