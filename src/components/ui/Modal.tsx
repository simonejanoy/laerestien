import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  /** id på overskriften i modalen, for skjermlesere. */
  labelledBy: string
  className?: string
  /** Større avrunding (24px), brukt i elevvisningen. */
  large?: boolean
  /** Bredere popup (880px) for tabeller og lister. */
  wide?: boolean
  /**
   * Nesten hele skjermen (opptil 1440px bred), uten innerpolstring og uten egen rulling –
   * innholdet styrer selv hva som ruller. Brukt i elevvisningen for læreren.
   */
  fullScreen?: boolean
  children: ReactNode
}

/** Åpne modaler, den øverste sist. Escape lukker bare den øverste (f.eks. en dialog inne i elevvisningen). */
const openModals: object[] = []

export function Modal({ open, onClose, labelledBy, className = '', large = false, wide = false, fullScreen = false, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const selfRef = useRef({})

  // Plassen i rekken følger bare åpning og lukking – ikke at onClose får ny identitet.
  useEffect(() => {
    if (!open) return
    const self = selfRef.current
    openModals.push(self)
    return () => {
      openModals.splice(openModals.indexOf(self), 1)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openModals.at(-1) === selfRef.current) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`flex max-h-full w-full flex-col bg-background outline-none ${
          fullScreen ? 'h-full max-w-[1440px] overflow-hidden' : `overflow-y-auto p-8 ${wide ? 'max-w-[880px]' : 'max-w-[560px]'}`
        } ${large ? 'rounded-3xl' : 'rounded-2xl'} ${className}`}
      >
        {children}
      </div>
    </div>
  )
}

export function ModalCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Lukk"
      className="flex size-[42px] shrink-0 cursor-pointer items-center justify-center rounded-lg bg-neutral-100 text-primary hover:bg-neutral-300"
    >
      <X className="size-[18px]" />
    </button>
  )
}
