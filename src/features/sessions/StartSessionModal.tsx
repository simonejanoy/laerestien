import { useState, type ComponentType, type SVGProps } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal, ModalCloseButton } from '../../components/ui/Modal'
import { CheckIcon, PauseIcon, PlayIcon, TabletIcon } from '../../components/ui/icons'
import type { Session } from '../../types'

const steps: { icon: ComponentType<SVGProps<SVGSVGElement>>; text: string }[] = [
  { icon: TabletIcon, text: 'Elevenes skjermer starter, og hver elev får oppgaver på sitt nivå.' },
  { icon: PauseIcon, text: 'Du kan pause økta når som helst, for eksempel for å forklare noe i plenum.' },
  { icon: CheckIcon, text: 'Fremgangen lagres automatisk, så elevene fortsetter der de slapp neste gang.' },
]

interface StartSessionModalProps {
  open: boolean
  session: Session
  onClose: () => void
  onConfirm: (hideExplanation: boolean) => void
}

export function StartSessionModal({ open, session, onClose, onConfirm }: StartSessionModalProps) {
  const [hideExplanation, setHideExplanation] = useState(false)

  return (
    <Modal open={open} onClose={onClose} labelledBy="start-okt-tittel" className="gap-6">
      <div className="flex items-start justify-between">
        <h2 id="start-okt-tittel" className="text-[26px] font-semibold text-on-background">
          Start undervisningsøkt?
        </h2>
        <ModalCloseButton onClick={onClose} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          ['Tema', session.topic],
          ['Klasse', session.className],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 rounded-lg bg-surface p-3.5 text-on-surface">
            <span className="text-[13px]">{label}</span>
            <span className="text-body leading-normal font-semibold">{value}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3.5 rounded-lg border-[0.5px] border-neutral-300 p-[18px] text-on-background">
        <p className="text-body leading-normal font-semibold">Slik fungerer det</p>
        {steps.map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-start gap-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-primary">
              <Icon />
            </span>
            <p className="text-[15px] leading-[21px]">{text}</p>
          </div>
        ))}
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 pl-1 text-[15px] text-on-background">
        <input
          type="checkbox"
          checked={hideExplanation}
          onChange={(e) => setHideExplanation(e.target.checked)}
          className="size-5 cursor-pointer rounded-[2px] border-neutral-500 accent-primary"
        />
        Ikke vis forklaringen igjen
      </label>

      <div className="flex justify-end gap-3">
        <Button
          variant="neutral"
          size="lg"
          onClick={onClose}
          className="font-semibold"
        >
          Avbryt
        </Button>
        <Button size="lg" onClick={() => onConfirm(hideExplanation)} className="font-semibold">
          <PlayIcon tight />
          Start økt
        </Button>
      </div>
    </Modal>
  )
}
