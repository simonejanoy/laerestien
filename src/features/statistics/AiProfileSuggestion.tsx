import { LoaderCircle, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AiError, SLOW_AI_HINT, fallbackNotice, requestProfile, subjectContext } from '../../ai/client'
import type { AnonStudentProfile } from '../../ai/contract'
import { AiBadge } from '../../components/ui/AiBadge'
import { Button } from '../../components/ui/Button'
import { useSlowAiHint } from '../../hooks/useSlowAiHint'
import { StatPanel } from './parts'

interface AiProfileSuggestionProps {
  firstName: string
  classId: string
  profile: AnonStudentProfile
}

const fieldClass =
  'w-full resize-y rounded-md border border-surface bg-background px-3 py-2 text-small text-on-background outline-none focus:border-secondary'

/**
 * Foreløpig profiltekst og nivåforslag fra AI-en. Teksten kan redigeres, men lagres ikke,
 * og nivået endres bare hvis læreren selv gjør det under «Elever».
 */
export function AiProfileSuggestion({ firstName, classId, profile }: AiProfileSuggestionProps) {
  const [notes, setNotes] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const slow = useSlowAiHint(loading, 'profile')

  const generate = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { text, meta } = await requestProfile({ classId, context: subjectContext(classId), student: profile, teacherNotes: notes.trim() })
      setDraft(text)
      setNotice(fallbackNotice(meta, 'Forslaget'))
    } catch (err) {
      if (!(err instanceof AiError)) console.error('Uventet feil ved profilforslag:', err)
      setError(err instanceof AiError ? err.message : 'Noe gikk galt. Prøv igjen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <StatPanel title="Profiltekst og nivå" small className="gap-3">
      <p className="text-small text-secondary">
        AI-en kan lage et foreløpig forslag ut fra {firstName}s resultater i appen. Navnet sendes ikke. Nivået endrer du
        selv under{' '}
        <Link to="/elever" className="text-primary underline">
          Elever
        </Link>
        .
      </p>

      <form onSubmit={generate} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-small text-primary">
          Dine egne observasjoner (valgfritt)
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="F.eks. hva du har sett i timene. Ikke skriv navn eller helseopplysninger."
            className={fieldClass}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" disabled={loading}>
            {loading ? <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {draft ? 'Lag nytt forslag' : 'Lag forslag med AI'}
          </Button>
          <span aria-live="polite" className="text-xs text-secondary">
            {loading && (slow ? SLOW_AI_HINT : 'AI-en lager et forslag …')}
          </span>
        </div>
      </form>

      {error && (
        <p role="alert" className="text-small text-error">
          {error}
        </p>
      )}

      {draft !== null && (
        <div className="flex flex-col gap-2">
          <label htmlFor="profilforslag" className="flex flex-wrap items-center gap-2 text-small text-primary">
            <AiBadge label="AI-generert forslag · ikke lagret" />
            Rediger forslaget
          </label>
          {notice && <p className="text-xs text-secondary">{notice}</p>}
          <textarea id="profilforslag" rows={10} value={draft} onChange={(e) => setDraft(e.target.value)} className={fieldClass} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-secondary">
              Forslaget er ikke en vurdering fra deg og lagres ikke. Kopier teksten hvis du vil bruke den.
            </p>
            <Button variant="neutral" onClick={() => setDraft(null)}>
              Forkast forslaget
            </Button>
          </div>
        </div>
      )}
    </StatPanel>
  )
}
