import type { ReactNode } from 'react'

/** Liten merkelapp, f.eks. «Nivå 2», «Hoderegning» eller «Trenger regneark». */
export function Tag({ className = 'bg-tertiary text-primary', children }: { className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex rounded px-[7px] py-[3px] text-xs leading-normal whitespace-nowrap ${className}`}>
      {children}
    </span>
  )
}
