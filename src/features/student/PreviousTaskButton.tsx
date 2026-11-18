import { ChevronLeft } from 'lucide-react'

/**
 * «Forrige oppgave» nederst til venstre i oppgavekortet, på samme rad som «Sjekk svaret mitt» / «Neste oppgave».
 * Samme høyde og hjørner som knappen til høyre. Vises bare når det går an å gå tilbake.
 */
export function PreviousTaskButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[52px] shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-card-border bg-background px-5 text-body text-primary hover:bg-surface-light"
    >
      <ChevronLeft className="size-6" aria-hidden />
      Forrige oppgave
    </button>
  )
}
