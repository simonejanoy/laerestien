import { LoaderCircle, Sparkles, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { AiError, newTaskId, requestTasks, subjectContext, toTextTask } from '../../ai/client'
import { Button } from '../../components/ui/Button'
import type { Session, TextTask } from '../../types'

interface AiTaskGeneratorProps {
  session: Session
  /** Oppgavene legges i utkastet. Læreren lagrer dem med «Lagre endringer». */
  onAdd: (tasks: TextTask[]) => void
}

const fieldClass =
  'w-full rounded-md border border-surface bg-background px-3 py-2 text-small text-on-background outline-none focus:border-secondary'

/** «Lag oppgaver med AI»: generelle oppgaver på tre nivåer ut fra temaet for økta. */
export function AiTaskGenerator({ session, onAdd }: AiTaskGeneratorProps) {
  const [open, setOpen] = useState(false)
  const [perLevel, setPerLevel] = useState(2)
  const [officialGoals, setOfficialGoals] = useState('')
  const [wishes, setWishes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ count: number; message: string } | null>(null)

  const generate = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const { tasks, message } = await requestTasks({
        kind: 'general',
        lesson: {
          ...subjectContext(session.className),
          topic: session.topic,
          sessionHeading: session.heading,
          sessionDescription: session.description,
          sessionGoals: session.goals,
        },
        perLevel,
        officialGoals: officialGoals.trim(),
        wishes: wishes.trim(),
      })
      onAdd(tasks.map((t) => toTextTask(t, newTaskId(session.id))))
      setResult({ count: tasks.length, message })
    } catch (err) {
      if (!(err instanceof AiError)) console.error('Uventet feil ved oppgavegenerering:', err)
      setError(err instanceof AiError ? err.message : 'Noe gikk galt. Prøv igjen.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[38px] cursor-pointer items-center gap-[7px] self-start rounded-[7px] bg-secondary px-3.5 text-small text-on-secondary hover:bg-secondary/90"
      >
        <Sparkles className="size-4" aria-hidden />
        Lag oppgaver med AI
      </button>
    )
  }

  return (
    <section aria-labelledby="ai-generator-tittel" className="flex flex-col gap-3 rounded-lg border border-surface bg-surface-light p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="ai-generator-tittel" className="flex items-center gap-2 text-h3 text-primary">
            <Sparkles className="size-5" aria-hidden />
            Lag oppgaver med AI
          </h2>
          <p className="text-small text-secondary">
            Oppgaver på nivå 1–3 om «{session.heading}». De legges i utkastet, merket som ikke gjennomgått, og du kan endre
            dem før og etter du lagrer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Lukk «Lag oppgaver med AI»"
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-primary hover:bg-surface"
        >
          <X className="size-[18px]" aria-hidden />
        </button>
      </div>

      <form onSubmit={generate} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-small text-primary">
          Kompetansemål (valgfritt)
          <textarea
            rows={2}
            value={officialGoals}
            onChange={(e) => setOfficialGoals(e.target.value)}
            placeholder="Lim inn målteksten ordrett fra læreplanen"
            className={`${fieldClass} resize-y`}
          />
          <span className="text-xs text-secondary">Står feltet tomt, kobler ikke AI-en oppgavene til kompetansemål.</span>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
          <label className="flex flex-col gap-1 text-small text-primary">
            Andre ønsker (valgfritt)
            <input
              value={wishes}
              onChange={(e) => setWishes(e.target.value)}
              placeholder="F.eks. «tekstoppgaver om penger»"
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-small text-primary">
            Oppgaver per nivå
            <select value={perLevel} onChange={(e) => setPerLevel(Number(e.target.value))} className={`${fieldClass} cursor-pointer`}>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {loading ? 'Lager oppgaver …' : 'Lag oppgaver'}
          </Button>
          <p aria-live="polite" className="text-xs text-secondary">
            {loading && 'AI-en lager og kontrollerer oppgavene. Det kan ta litt tid.'}
          </p>
        </div>
      </form>

      {error && (
        <p role="alert" className="text-small text-error">
          {error}
        </p>
      )}
      {result && (
        <div role="status" className="flex flex-col gap-1 rounded-md bg-background px-3 py-2 text-small text-on-background">
          <p>
            {result.count > 0
              ? `${result.count} oppgaver er lagt til i utkastet under nivåene sine. Se gjennom dem, og trykk «Lagre endringer» for å gjøre dem tilgjengelige for elevene.`
              : 'AI-en laget ingen oppgaver denne gangen.'}
          </p>
          {result.message && (
            <p>
              <span className="font-medium">Fra AI-assistenten:</span> {result.message}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
