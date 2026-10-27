import { ArrowUp } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { SparkleIcon } from '../../components/ui/icons'
import type { Task } from '../../types'
import { expressionOf } from './taskUtils'

interface AiAssistantProps {
  task: Task
  taskNumber: number
}

/** AI-assistent ved valgt oppgave. Ikke koblet til en AI-tjeneste ennå. */
export function AiAssistant({ task, taskNumber }: AiAssistantProps) {
  const [prompt, setPrompt] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const suggestions = [`Forenkle oppgave ${taskNumber}`, 'Bytt til tekstoppgave', 'Generer ny lignende', 'Legg til hint']

  const ask = (text: string) => {
    if (!text.trim()) return
    setNotice(`«${text.trim()}» – AI-assistenten er ikke koblet til ennå.`)
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    ask(prompt)
    setPrompt('')
  }

  return (
    <section className="flex flex-col gap-3 border-t border-surface pt-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary text-on-primary">
          <SparkleIcon />
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-small text-primary">AI-assistent</span>
          <span className="text-xs text-secondary">Tilgjengelig ved oppgavene</span>
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

        <div className="flex flex-col gap-2">
          <p className="text-xs text-secondary">Foreslåtte handlinger:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => ask(text)}
                className="cursor-pointer rounded-[20px] border border-surface bg-surface-light px-3 py-[7px] text-[13px] text-primary hover:bg-surface"
              >
                {text}
              </button>
            ))}
          </div>
        </div>

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
            aria-label="Send"
            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-on-primary hover:bg-primary/90"
          >
            <ArrowUp className="size-[18px]" />
          </button>
        </form>

        {notice && (
          <p role="status" className="text-xs text-secondary">
            {notice}
          </p>
        )}
      </div>
    </section>
  )
}
