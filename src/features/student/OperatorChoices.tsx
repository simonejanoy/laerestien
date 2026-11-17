import { OPERATOR_OPTIONS } from '../../ai/taskText'

/** Regning: fire knapper for regnetegnet (laget av appen, ikke av AI-en). */
export function OperatorChoices({
  value,
  disabled,
  onChange,
  label = 'Velg regnetegnet',
  align = 'center',
  size = 'md',
}: {
  value: string
  disabled: boolean
  onChange: (value: string) => void
  label?: string
  align?: 'center' | 'start'
  /** «sm»: mindre knapper som får plass i en linje med tallbokser (regnestykke-malene i Multiplikasjon). */
  size?: 'md' | 'sm'
}) {
  const names: Record<string, string> = { '+': 'pluss', '−': 'minus', '·': 'gange', ':': 'dele' }
  return (
    <div role="radiogroup" aria-label={label} className={
        size === 'sm'
          ? // Smal skjerm: 2 × 2 knapper, så de får plass ved siden av tallboksene.
            'grid shrink-0 grid-cols-2 gap-1.5 min-[480px]:grid-cols-4'
          : `flex w-full flex-wrap gap-4 ${align === 'center' ? 'justify-center' : 'justify-start'}`
      }>
      {OPERATOR_OPTIONS.map((sign) => (
        <button
          key={sign}
          type="button"
          role="radio"
          aria-checked={value === sign}
          aria-label={names[sign]}
          disabled={disabled}
          onClick={() => onChange(sign)}
          className={`flex cursor-pointer items-center justify-center rounded-xl border-2 leading-none text-primary disabled:cursor-default ${size === 'sm' ? 'size-11 text-2xl' : 'size-16 text-3xl'} ${
            value === sign ? 'border-primary bg-surface-light' : 'border-secondary bg-background'
          }`}
        >
          {sign}
        </button>
      ))}
    </div>
  )
}
