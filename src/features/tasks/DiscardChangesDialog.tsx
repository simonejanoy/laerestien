import { Button } from '../../components/ui/Button'
import { Modal, ModalCloseButton } from '../../components/ui/Modal'

interface DiscardChangesDialogProps {
  taskNumber: number
  onKeepEditing: () => void
  onDiscard: () => void
}

/** Spør før ulagrede endringer i en oppgave forkastes. */
export function DiscardChangesDialog({ taskNumber, onKeepEditing, onDiscard }: DiscardChangesDialogProps) {
  return (
    <Modal open onClose={onKeepEditing} labelledBy="forkast-endringer-tittel" className="gap-5">
      <div className="flex items-start justify-between gap-4">
        <h2 id="forkast-endringer-tittel" className="text-h2 text-on-background">
          Forkaste endringene?
        </h2>
        <ModalCloseButton onClick={onKeepEditing} />
      </div>
      <p className="rounded-lg border-[0.5px] border-neutral-300 p-5 text-body text-on-background">
        Du har endringer i oppgave {taskNumber} som ikke er lagret. Hvis du forkaster dem, går oppgaven tilbake til
        slik den var før du begynte å redigere.
      </p>
      <div className="flex justify-end gap-3">
        <Button variant="neutral" size="lg" onClick={onKeepEditing}>
          Fortsett å redigere
        </Button>
        <button
          type="button"
          onClick={onDiscard}
          className="inline-flex min-h-12 cursor-pointer items-center rounded-lg bg-error px-6 text-body text-on-error hover:bg-error/90"
        >
          Forkast endringer
        </button>
      </div>
    </Modal>
  )
}
