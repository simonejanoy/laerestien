interface ProgressBarProps {
  value: number
  max: number
  label: string
  /** Størrelse og innrykk på skinnen, f.eks. «h-[11px] w-[121px] px-0.5». */
  className?: string
}

/** Mørk skinne med lys fylling, som «gjennomført bar» i Figma. */
export function ProgressBar({ value, max, label, className = '' }: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={`flex items-center rounded-lg bg-primary ${className}`}
    >
      <div
        className="h-[7px] rounded bg-calendar-background"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
