import { PenLine, Sparkles } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { Modal, ModalCloseButton } from '../../components/ui/Modal'
import type { Level, Session, SessionTask } from '../../types'
import { AiTaskGenerator } from './AiTaskGenerator'
import { ManualTaskForm } from './ManualTaskForm'

export type AddTasksTab = 'ai' | 'manual'

interface AddTasksDialogProps {
  session: Session
  /** Utkastet slik det er nå (AI-en får noen representative oppgaver per nivå). */
  tasks: SessionTask[]
  /** Nivået som er valgt på siden. «Lag selv» starter der. */
  level: Level
  initialTab?: AddTasksTab
  /** AI-oppgaver legges i utkastet (merket som ikke gjennomgått). Popupen er åpen, så læreren ser resultatet. */
  onAddAi: (tasks: SessionTask[]) => void
  /** En oppgave læreren har laget selv. Popupen lukkes etterpå. */
  onAddManual: (task: SessionTask) => void
  onClose: () => void
}

const TABS: { id: AddTasksTab; label: string; Icon: typeof Sparkles }[] = [
  { id: 'ai', label: 'Lag med AI', Icon: Sparkles },
  { id: 'manual', label: 'Lag selv', Icon: PenLine },
]

let counter = 0

/**
 * «Legg til oppgaver»: én popup for all opprettelse av oppgaver. Øverst velger læreren «Lag med AI» (generatoren som før)
 * eller «Lag selv» (et rent manuelt skjema). Fanene følger WAI-ARIA-mønsteret: piltastene bytter fane, Tab går inn i
 * innholdet, og Escape eller «Lukk» lukker popupen.
 */
export function AddTasksDialog({ session, tasks, level, initialTab = 'ai', onAddAi, onAddManual, onClose }: AddTasksDialogProps) {
  const [tab, setTab] = useState<AddTasksTab>(initialTab)
  const tabRefs = useRef<Record<AddTasksTab, HTMLButtonElement | null>>({ ai: null, manual: null })

  const onTabKey = (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next: AddTasksTab = event.key === 'Home' ? 'ai' : event.key === 'End' ? 'manual' : tab === 'ai' ? 'manual' : 'ai'
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <Modal open onClose={onClose} labelledBy="legg-til-oppgaver-tittel" wide className="gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="legg-til-oppgaver-tittel" className="text-h2 text-primary">
            Legg til oppgaver
          </h2>
          <p className="text-small text-secondary">
            {session.title} · {session.heading}
          </p>
        </div>
        <ModalCloseButton onClick={onClose} />
      </div>

      <div role="tablist" aria-label="Hvordan vil du lage oppgavene?" onKeyDown={onTabKey} className="flex gap-1 self-start rounded-lg bg-surface-light p-1">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el
            }}
            type="button"
            role="tab"
            id={`legg-til-fane-${id}`}
            aria-selected={tab === id}
            aria-controls={`legg-til-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            className={`flex h-[38px] cursor-pointer items-center gap-[7px] rounded-[7px] px-3.5 text-small ${
              tab === id ? 'bg-primary text-on-primary' : 'text-primary hover:bg-surface'
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`legg-til-panel-${tab}`} aria-labelledby={`legg-til-fane-${tab}`}>
        {tab === 'ai' ? (
          <AiTaskGenerator session={session} tasks={tasks} onAdd={onAddAi} onClose={onClose} />
        ) : (
          <ManualTaskForm level={level} newId={() => `ny-${Date.now()}-${counter++}`} onSave={onAddManual} onCancel={onClose} />
        )}
      </div>
    </Modal>
  )
}
