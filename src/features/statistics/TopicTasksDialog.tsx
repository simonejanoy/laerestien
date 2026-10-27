import { LevelBadge } from '../../components/ui/LevelBadge'
import { Modal, ModalCloseButton } from '../../components/ui/Modal'
import type { TopicInsight } from '../../types'
import { statusLabel, statusText } from './statusStyles'

interface TopicTasksDialogProps {
  insight: TopicInsight | null
  /** Tema som ble valgt, også når det ikke finnes data for det. */
  topic: string | null
  classSize: number
  onClose: () => void
}

/** «Oppgaver i tema»: hvordan klassen har gjort det på hver oppgave i temaet. */
export function TopicTasksDialog({ insight, topic, classSize, onClose }: TopicTasksDialogProps) {
  return (
    <Modal
      open={topic !== null}
      onClose={onClose}
      labelledBy="tema-tittel"
      wide
      className="gap-5 shadow-[0_16px_48px_rgba(36,59,94,0.18)]"
    >
      <div className="flex items-start gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <h2 id="tema-tittel" className="text-h2 text-on-surface">
              {topic}
            </h2>
            {insight && (
              <span className={`rounded-full px-2.5 py-1 text-[13px] font-medium ${statusText[insight.status]}`}>
                {statusLabel[insight.status]}
              </span>
            )}
          </div>
          <p className="text-small text-secondary">
            Oppgavene til venstre, og hva klassen trenger hjelp med til høyre.
          </p>
        </div>
        <ModalCloseButton onClick={onClose} />
      </div>

      {!insight ? (
        <p className="rounded-xl bg-tertiary p-6 text-small text-secondary">
          Det er ikke gjort nok oppgaver i dette temaet ennå til å vise detaljer.
        </p>
      ) : (
        <>
          <div className="flex gap-4">
            <ul className="flex flex-1 flex-col">
              {insight.tasks.map((task) => {
                const wrong = task.attempted - task.correct
                return (
                  <li key={task.expression} className="flex items-center gap-3 border-b border-surface py-2.5">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-medium text-on-surface">{task.expression}</span>
                      <span className="text-[13px] text-secondary">{task.category}</span>
                    </span>
                    <LevelBadge level={task.level} />
                    <span className="flex w-24 shrink-0 flex-col items-end gap-1">
                      <span className="text-[13px] font-medium text-on-surface">
                        {task.attempted} av {classSize}
                      </span>
                      <span
                        className="flex h-1.5 w-24 overflow-hidden rounded-[3px] bg-surface"
                        role="img"
                        aria-label={`${task.correct} riktig, ${wrong} feil, ${classSize - task.attempted} ikke gjort`}
                      >
                        <span className="bg-understanding" style={{ width: `${(task.correct / classSize) * 100}%` }} />
                        <span className="bg-needs-support" style={{ width: `${(wrong / classSize) * 100}%` }} />
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>

            <aside className="flex w-[280px] shrink-0 flex-col gap-4 rounded-xl bg-tertiary p-4 text-on-surface">
              <div className="flex flex-col gap-2">
                <h3 className="font-medium">Klassen sliter med</h3>
                {insight.struggles.map((s) => (
                  <div key={s.expression} className="flex flex-col gap-0.5 rounded-lg bg-background px-3 py-2.5">
                    <span className="text-small font-medium">{s.expression}</span>
                    <span className="text-[13px] text-needs-support">{s.text}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-medium">Har ikke prøvd nivå {insight.notTried.level} ennå</h3>
                <div className="flex flex-wrap gap-1.5">
                  {insight.notTried.students.map((name) => (
                    <span key={name} className="rounded-full bg-background px-2.5 py-1 text-[13px]">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-medium">Går bra</h3>
                <p className="text-[13px] text-understanding">{insight.goingWell}</p>
              </div>
            </aside>
          </div>

          <div className="flex items-center text-[13px] text-secondary">
            <span className="flex-1">
              {insight.tasks.length} oppgaver · {classSize} elever i klassen
            </span>
            <span className="flex gap-4">
              {[
                ['bg-understanding', 'Riktig'],
                ['bg-needs-support', 'Feil'],
                ['bg-surface', 'Ikke gjort'],
              ].map(([color, label]) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className={`size-2.5 rounded-[3px] ${color}`} aria-hidden />
                  {label}
                </span>
              ))}
            </span>
          </div>
        </>
      )}
    </Modal>
  )
}
