import { Button } from '../../components/ui/Button'
import { Modal, ModalCloseButton } from '../../components/ui/Modal'
import type { Session } from '../../types'
import { sessionLabel } from './sessionsContext'

interface SkipSessionModalProps {
  open: boolean
  /** Økta læreren vil gå videre til. */
  session: Session
  /** Øktene som hoppes over. */
  blockers: Session[]
  onClose: () => void
  onConfirm: () => void
}

export function SkipSessionModal({ open, session, blockers, onClose, onConfirm }: SkipSessionModalProps) {
  const skipped = blockers.map(sessionLabel).join(' og ')

  return (
    <Modal open={open} onClose={onClose} labelledBy="hopp-over-tittel" className="gap-[15px]">
      <div className="flex items-center justify-between">
        <p className="text-body text-primary opacity-75">Tema: {session.topic}</p>
        <ModalCloseButton onClick={onClose} />
      </div>

      <h2 id="hopp-over-tittel" className="text-h2 text-on-background">
        Hopp over undervisningsøkt {skipped}?
      </h2>

      <p className="rounded-lg border-[0.5px] border-neutral-300 p-[25px] text-body text-on-background">
        Du kan hoppe over økt {skipped} og gå videre til økt {sessionLabel(session)} nå. Du kan når
        som helst komme tilbake og gjennomføre økt {skipped}.
      </p>

      <div className="flex justify-end gap-3">
        <Button variant="neutral" size="lg" onClick={onClose}>
          Avbryt
        </Button>
        <Button variant="secondary" size="lg" onClick={onConfirm}>
          Hopp over
        </Button>
      </div>
    </Modal>
  )
}
