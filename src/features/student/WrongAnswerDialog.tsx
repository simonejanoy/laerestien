import lightbulb from '../../assets/student/lyspaere.svg'
import retry from '../../assets/student/prov-igjen.svg'
import { Modal } from '../../components/ui/Modal'

interface WrongAnswerDialogProps {
  open: boolean
  attemptsLeft: number
  retryText: string
  onHint: () => void
  onRetry: () => void
}

/** «Det ble ikke riktig denne gangen» – eleven velger hint eller nytt forsøk. */
export function WrongAnswerDialog({ open, attemptsLeft, retryText, onHint, onRetry }: WrongAnswerDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onRetry}
      labelledBy="feil-svar-tittel"
      large
      className="gap-5 shadow-[0_16px_48px_rgba(36,59,94,0.25)]"
    >
      <h2 id="feil-svar-tittel" className="text-h2 text-on-background">
        Det ble ikke riktig denne gangen
      </h2>
      <p className="text-body text-secondary">Hva vil du gjøre nå?</p>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={onHint}
          className="flex flex-1 cursor-pointer flex-col items-start gap-2 rounded-2xl border-2 border-surface bg-background p-5 text-left hover:border-secondary"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-surface-variant">
            <img src={lightbulb} alt="" width={22} height={22} />
          </span>
          <span className="text-h3 text-on-background">Få et hint</span>
          <span className="text-small text-secondary">Vi viser en smart måte å tenke på.</span>
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="flex flex-1 cursor-pointer flex-col items-start gap-2 rounded-2xl border-2 border-secondary bg-tertiary p-5 text-left hover:bg-surface"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-level2-surface">
            <img src={retry} alt="" width={26} height={26} />
          </span>
          <span className="text-h3 text-on-background">Prøv selv</span>
          <span className="text-small text-secondary">{retryText}</span>
        </button>
      </div>

      <p className="text-small text-secondary">Du har {attemptsLeft} forsøk igjen</p>
    </Modal>
  )
}
