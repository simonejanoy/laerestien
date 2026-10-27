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
  children: ReactNode
}

export function Modal({ open, onClose, labelledBy, className = '', large = false, wide = false, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
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
        className={`flex max-h-full w-full flex-col overflow-y-auto bg-background p-8 outline-none ${wide ? 'max-w-[880px]' : 'max-w-[560px]'} ${large ? 'rounded-3xl' : 'rounded-2xl'} ${className}`}
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
