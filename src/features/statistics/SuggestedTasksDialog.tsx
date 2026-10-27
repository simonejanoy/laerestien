import { ArrowUp, PencilLine, Sparkles, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal, ModalCloseButton } from '../../components/ui/Modal'
import { levelStyles } from '../../components/ui/levelStyles'
import type { SuggestedTask } from '../../types'
import { formatNumber, operatorSymbol } from '../tasks/taskUtils'

interface SuggestedTasksDialogProps {
  open: boolean
  studentName: string
  initialTasks: SuggestedTask[]
  onClose: () => void
  onConfirm: (tasks: SuggestedTask[]) => void
}

const expression = (math: NonNullable<SuggestedTask['math']>) =>
  `${formatNumber(math.a)} ${operatorSymbol(math.operator)} ${formatNumber(math.b)} =`

/** Lettere: halver tallene. Vanskeligere: doble og legg til litt, så det blir tierovergang. */
const easier = (n: number) => Math.max(1, Math.round(n / 2))
const harder = (n: number) => n * 2 + 3

/** «Foreslåtte oppgaver til …»: læreren ser gjennom, justerer og legger til AI-forslagene. */
export function SuggestedTasksDialog({ open, studentName, initialTasks, onClose, onConfirm }: SuggestedTasksDialogProps) {
  const [tasks, setTasks] = useState(initialTasks)
  const [selectedId, setSelectedId] = useState(initialTasks[0]?.id)
  const [prompt, setPrompt] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const selected = tasks.find((t) => t.id === selectedId) ?? tasks[0]
  const levels = [...new Set(tasks.map((t) => t.level))].sort()

  const adjust = (change: (n: number) => number) => {
    if (!selected?.math) return
    const math = { ...selected.math, a: change(selected.math.a), b: change(selected.math.b) }
    setTasks(tasks.map((t) => (t.id === selected.id ? { ...t, math, title: expression(math) } : t)))
  }

  const remove = (id: string) => {
    const rest = tasks.filter((t) => t.id !== id)
    setTasks(rest)
    if (id === selectedId) setSelectedId(rest[0]?.id)
  }

  const ask = (event: FormEvent) => {
    event.preventDefault()
    if (!prompt.trim()) return
    setNotice(`«${prompt.trim()}» – AI-assistenten er ikke koblet til ennå.`)
    setPrompt('')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="forslag-tittel"
      wide
      className="gap-5 shadow-[0_16px_48px_rgba(36,59,94,0.18)]"
    >
      <div className="flex items-start gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <h2 id="forslag-tittel" className="text-h2 text-on-background">
            Foreslåtte oppgaver til {studentName}
          </h2>
          <p className="text-small text-secondary">
            {tasks.length} oppgaver valgt ut fra det {studentName} øver på. Trykk på en oppgave for å se den.
          </p>
        </div>
        <ModalCloseButton onClick={onClose} />
      </div>

      <div className="flex gap-5">
        <ul className="flex flex-1 flex-col gap-1.5">
          {tasks.map((task) => {
            const isSelected = task.id === selected?.id
            const level = levelStyles[task.level]
            return (
              <li
                key={task.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                  isSelected ? 'border-secondary bg-tertiary' : 'border-surface bg-background'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(task.id)}
                  className="flex min-w-0 flex-1 cursor-pointer flex-col text-left"
                >
                  <span className="truncate text-body text-on-background">{task.title}</span>
                  <span className="text-small text-secondary">{task.subtitle}</span>
                </button>
                <span className="text-small text-secondary">{task.category}</span>
                <span className={`rounded-full px-2 py-0.5 text-small ${level.surface} ${level.text}`}>Nivå {task.level}</span>
                <button
                  type="button"
                  aria-label={`Endre ${task.title}`}
                  onClick={() => setSelectedId(task.id)}
                  className="cursor-pointer text-primary"
                >
                  <PencilLine className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label={`Fjern ${task.title}`}
                  onClick={() => remove(task.id)}
                  className="cursor-pointer text-primary hover:text-error"
                >
                  <Trash2 className="size-5" />
                </button>
              </li>
            )
          })}
          {tasks.length === 0 && <li className="text-small text-secondary">Alle forslagene er fjernet.</li>}
        </ul>

        {selected && (
          <aside className="flex w-[300px] shrink-0 flex-col gap-3.5 rounded-xl bg-tertiary p-5">
            <p className="flex items-center gap-3 text-small text-secondary">
              <PencilLine className="size-5 text-primary" />
              Endre på oppgaven
            </p>
            <div className="flex flex-col items-center gap-3 rounded-xl border border-surface bg-background p-4">
              <p className="text-center text-small text-secondary">{selected.instruction}</p>
              {selected.math && (
                <span className="flex items-center gap-2.5">
                  <span className="text-h2 text-on-background">{expression(selected.math)}</span>
                  <span className="h-9 w-14 rounded-lg border-[1.5px] border-secondary bg-background" aria-hidden />
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <AdjustButton label="Lettere" disabled={!selected.math} onClick={() => adjust(easier)} />
              <AdjustButton label="Vanskeligere" disabled={!selected.math} onClick={() => adjust(harder)} />
            </div>
            <form onSubmit={ask} className="flex flex-col gap-2">
              <span className="flex items-center gap-1.5 text-small text-secondary">
                <Sparkles className="size-[18px] text-primary" />
                Andre endringer
              </span>
              <span className="flex gap-2">
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="F.eks. «bruk tall under 50»"
                  aria-label="Andre endringer"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-secondary bg-background px-3 text-small text-primary outline-none placeholder:text-secondary"
                />
                <button
                  type="submit"
                  aria-label="Send"
                  className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-on-primary"
                >
                  <ArrowUp className="size-[18px]" />
                </button>
              </span>
              {notice && <span className="text-xs text-secondary">{notice}</span>}
            </form>
          </aside>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="flex-1 text-small text-secondary">
          {tasks.length} oppgaver{levels.length > 0 && ` · Nivå ${levels[0]}${levels.length > 1 ? `–${levels[levels.length - 1]}` : ''}`}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="h-[49px] cursor-pointer rounded-lg border border-secondary px-[22px] text-body text-on-background hover:bg-tertiary"
        >
          Avbryt
        </button>
        <Button size="lg" disabled={tasks.length === 0} onClick={() => onConfirm(tasks)}>
          Legg til for {studentName}
        </Button>
      </div>
    </Modal>
  )
}

function AdjustButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-10 flex-1 cursor-pointer rounded-lg border border-secondary text-body text-on-background hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  )
}
