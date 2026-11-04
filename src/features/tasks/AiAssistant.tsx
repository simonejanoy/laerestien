import { ArrowUp, LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { AiError, sendChat, subjectContext } from '../../ai/client'
import type { ChatContent } from '../../ai/contract'
import { SparkleIcon } from '../../components/ui/icons'
import type { Task } from '../../types'
import { answerOf, expressionOf } from './taskUtils'

interface AiAssistantProps {
  task: Task
  taskNumber: number
  topic: string
}

/** Det læreren ser i samtalen. Historikken som sendes til AI-en ligger for seg. */
interface Message {
  role: 'user' | 'model'
  text: string
}

/**
 * AI-assistent ved valgt oppgave: fri samtale med vanlig tekst (ikke JSON).
 * AI-en kan ikke endre oppgaven – læreren gjør endringene selv i feltene over.
 */
export function AiAssistant({ task, taskNumber, topic }: AiAssistantProps) {
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  // Sendes uendret ved hver ny melding, så modellens thought signatures blir med.
  const [history, setHistory] = useState<ChatContent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const suggestions = [`Forenkle oppgave ${taskNumber}`, 'Bytt til tekstoppgave', 'Generer ny lignende', 'Legg til hint']

  const ask = async (text: string) => {
    const question = text.trim()
    if (!question || loading) return

    // Første melding får med fag, trinn og oppgaven, så AI-en ikke må spørre.
    const { subject, grade } = subjectContext()
    const content =
      history.length === 0
        ? `Kontekst fra appen: ${subject}, ${grade}. Tema: ${topic}. Oppgave ${taskNumber}, nivå ${task.level} (${task.type.toLowerCase()}): «${task.instruction}» ${expressionOf(task)} = ${answerOf(task)}.\n\n${question}`
        : question
    const userTurn: ChatContent = { role: 'user', parts: [{ text: content }] }

    setMessages((m) => [...m, { role: 'user', text: question }])
    setPrompt('')
    setError(null)
    setLoading(true)
    try {
      const reply = await sendChat([...history, userTurn])
      setHistory([...history, userTurn, reply.content])
      setMessages((m) => [...m, { role: 'model', text: reply.text }])
    } catch (err) {
      if (!(err instanceof AiError)) console.error('Uventet feil i AI-chatten:', err)
      setError(err instanceof AiError ? err.message : 'Noe gikk galt. Prøv igjen.')
      // Meldingen ble ikke besvart: ta den ut igjen, så læreren kan sende den på nytt.
      setMessages((m) => m.slice(0, -1))
      setPrompt(question)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void ask(prompt)
  }

  return (
    <section className="flex flex-col gap-3 border-t border-surface pt-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary text-on-primary">
          <SparkleIcon />
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-small text-primary">AI-assistent</span>
          <span className="text-xs text-secondary">Gir forslag – endringene gjør du selv i feltene over</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-surface bg-background p-4">
        <div className="flex flex-col gap-1">
          <p className="text-body text-primary">
            Oppgave {taskNumber} · Nivå {task.level}
          </p>
          <p className="text-small text-secondary">
            {expressionOf(task)} = ? · {task.type.toLowerCase()}
          </p>
        </div>

        {messages.length > 0 && (
          <ol aria-label="Samtale med AI-assistenten" className="flex flex-col gap-2">
            {messages.map((message, i) => (
              <li
                key={i}
                className={`rounded-lg px-3 py-2 text-[13px] whitespace-pre-wrap ${
                  message.role === 'user' ? 'self-end bg-surface-light text-primary' : 'bg-tertiary text-on-background'
                }`}
              >
                <span className="sr-only">{message.role === 'user' ? 'Du: ' : 'AI-assistenten: '}</span>
                {message.text}
              </li>
            ))}
          </ol>
        )}

        <p aria-live="polite" className="text-xs text-secondary">
          {loading && (
            <span className="flex items-center gap-1.5">
              <LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden />
              AI-assistenten skriver …
            </span>
          )}
        </p>
        {error && (
          <p role="alert" className="text-xs text-error">
            {error}
          </p>
        )}

        {messages.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-secondary">Foreslåtte handlinger:</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((text) => (
                <button
                  key={text}
                  type="button"
                  disabled={loading}
                  onClick={() => void ask(text)}
                  className="cursor-pointer rounded-[20px] border border-surface bg-surface-light px-3 py-[7px] text-[13px] text-primary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Skriv ønsket endring eller spørsmål til AI..."
            aria-label="Melding til AI-assistenten"
            className="min-h-10 flex-1 rounded-lg border border-surface bg-surface-light px-3.5 py-2.5 text-[13px] text-primary outline-none placeholder:text-secondary focus:border-secondary"
          />
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            aria-label="Send"
            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-on-primary hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ArrowUp className="size-[18px]" />
          </button>
        </form>
      </div>
    </section>
  )
}
