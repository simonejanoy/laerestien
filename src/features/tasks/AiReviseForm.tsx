import { ArrowUp, LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { AiError, requestTasks, toDraft, toTextTask } from '../../ai/client'
import type { AnonStudentProfile, SubjectContext } from '../../ai/contract'
import type { TextTask } from '../../types'

interface AiReviseFormProps {
  task: TextTask
  context: SubjectContext & { topic: string }
  /** Tilgjengelig navn på feltet, f.eks. «Juster oppgave 3 med AI». */
  label: string
  /** Med når oppgaven er tilpasset en elev (anonymisert). */
  classId?: string
  student?: AnonStudentProfile
  /** Ny versjon av oppgaven (ikke gjennomgått) og en kort beskjed fra AI-en. */
  onRevised: (task: TextTask, message: string) => void
  /** AI-en svarte med et spørsmål i stedet for en ny versjon. */
  onMessage?: (message: string) => void
}

/** «Juster med AI»: læreren skriver hva som skal endres, AI-en lager en ny versjon. */
export function AiReviseForm({ task, context, label, classId, student, onRevised, onMessage }: AiReviseFormProps) {
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [question, setQuestion] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!instruction.trim() || loading) return
    setLoading(true)
    setError(null)
    setQuestion('')
    try {
      const result = await requestTasks({
        kind: 'revise',
        context,
        task: toDraft(task),
        instruction: instruction.trim(),
        classId,
        student,
      })
      const revised = result.tasks[0]
      if (revised) {
        onRevised(toTextTask(revised, task.id), result.message)
        setInstruction('')
      } else {
        // AI-en trenger mer informasjon (f.eks. hva «enklere» betyr).
        setQuestion(result.message)
        onMessage?.(result.message)
      }
    } catch (err) {
      if (!(err instanceof AiError)) console.error('Uventet feil ved justering med AI:', err)
      setError(err instanceof AiError ? err.message : 'Noe gikk galt. Prøv igjen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2">
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={loading}
          placeholder="Juster med AI, f.eks. «bruk tall under 50»"
          aria-label={label}
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-surface bg-surface-light px-3 py-2 text-[13px] text-primary outline-none placeholder:text-secondary focus:border-secondary disabled:opacity-70"
        />
        <button
          type="submit"
          disabled={loading || !instruction.trim()}
          aria-label="Send til AI"
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-on-primary hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <LoaderCircle className="size-[18px] motion-safe:animate-spin" aria-hidden /> : <ArrowUp className="size-[18px]" />}
        </button>
      </span>
      <span aria-live="polite" className="text-xs">
        {loading && <span className="text-secondary">AI-en justerer oppgaven …</span>}
        {question && <span className="text-on-background">Spørsmål fra AI-assistenten: {question}</span>}
      </span>
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </form>
  )
}
