import { Button } from '../../components/ui/Button'
import { Modal, ModalCloseButton } from '../../components/ui/Modal'
import type { Session } from '../../types'
import { sessionLabel } from './sessionsContext'

interface DeleteSessionDialogProps {
  session: Session
  onCancel: () => void
  onConfirm: () => void
}

/** Bekreftelse før en økt slettes. */
export function DeleteSessionDialog({ session, onCancel, onConfirm }: DeleteSessionDialogProps) {
  return (
    <Modal open onClose={onCancel} labelledBy="slett-okt-tittel" className="gap-5">
      <div className="flex items-start justify-between gap-4">
        <h2 id="slett-okt-tittel" className="text-h2 text-on-background">
          Slette økt {sessionLabel(session)}?
        </h2>
        <ModalCloseButton onClick={onCancel} />
      </div>
      <p className="rounded-lg border-[0.5px] border-neutral-300 p-5 text-body text-on-background">
        «{session.heading}» ({session.date?.toLowerCase()} kl. {session.time}) og oppgavene i økta blir slettet. Dette
        kan ikke angres.
      </p>
      <div className="flex justify-end gap-3">
        <Button variant="neutral" size="lg" onClick={onCancel}>
          Avbryt
        </Button>
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex min-h-12 cursor-pointer items-center rounded-lg bg-error px-6 text-body text-on-error hover:bg-error/90"
        >
          Slett økt
        </button>
      </div>
    </Modal>
  )
}
