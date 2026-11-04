import { CircleCheck, CircleDashed, Sparkles } from 'lucide-react'

type AiStatus = 'unreviewed' | 'reviewed' | 'suggestion'

const labels: Record<AiStatus, string> = {
  unreviewed: 'AI-generert · ikke gjennomgått',
  reviewed: 'AI-generert · gjennomgått av deg',
  suggestion: 'AI-forslag · ikke lagt til',
}

/**
 * Merkelapp på innhold fra AI-assistenten (bare i lærervisningen).
 * Status vises med ikon og tekst, ikke bare farge.
 */
export function AiBadge({ status = 'unreviewed', label }: { status?: AiStatus; label?: string }) {
  const Icon = status === 'reviewed' ? CircleCheck : status === 'suggestion' ? Sparkles : CircleDashed
  return (
    <span className="inline-flex items-center gap-1 rounded border border-primary/60 bg-surface-variant px-[7px] py-[3px] text-xs leading-normal whitespace-nowrap text-primary">
      <Icon className="size-3.5 shrink-0" strokeWidth={2.2} aria-hidden />
      {label ?? labels[status]}
    </span>
  )
}
