import { createElement as h, type ReactElement } from 'react'
import type { EquationAnswer } from '../../ai/patternDisplay.ts'

// Svarfeltene når eleven skal skrive regnestykker selv: én rad per regnestykke, med regnetegnene og = ferdig skrevet,
// og en liten tallboks for hvert tall – «[ ] + [ ] = [ ]» og «[ ] · [ ] = [ ]». Eleven skriver bare tall.
// Skrevet med createElement (ikke JSX), så komponenten kan testes i Node med renderToStaticMarkup.

/** Det eleven kan skrive i en tallboks: bare sifre, høyst seks. */
export const cleanNumber = (value: string) => value.replace(/\D/g, '').slice(0, 6)

const SIGN_NAMES: Record<EquationAnswer['sign'], string> = { '+': 'pluss', '−': 'minus', '·': 'gange', ':': 'deling' }

interface EquationFieldsProps {
  equations: EquationAnswer[]
  /** Tallene i boksene, i rekkefølge (rad for rad, resultatet sist i hver rad). */
  values: string[]
  readOnly: boolean
  onChange: (index: number, value: string) => void
}

const boxClass =
  'h-12 w-16 rounded-lg border-2 border-secondary bg-background text-center text-xl text-on-background outline-none read-only:bg-tertiary focus:shadow-[0_0_0_4px_rgba(79,117,150,0.18)]'

/** Radene med tallbokser. Regnetegnene står mellom boksene; skjermlesere får vite hva hver boks er. */
export function EquationFields({ equations, values, readOnly, onChange }: EquationFieldsProps): ReactElement {
  let index = 0
  const rows = equations.map((equation, row) => {
    const name = SIGN_NAMES[equation.sign]
    const items: ReactElement[] = []
    const box = (label: string) => {
      const i = index++
      return h('input', {
        key: `boks-${i}`,
        inputMode: 'numeric',
        autoComplete: 'off',
        'aria-label': label,
        value: values[i] ?? '',
        readOnly,
        autoFocus: i === 0 && !readOnly,
        onChange: (e: { target: { value: string } }) => onChange(i, cleanNumber(e.target.value)),
        className: boxClass,
      })
    }
    equation.operands.forEach((_, k) => {
      if (k > 0) items.push(h('span', { key: `tegn-${k}`, className: 'text-3xl text-primary' }, equation.sign))
      items.push(box(`Regnestykke ${row + 1} med ${name}, tall ${k + 1}`))
    })
    items.push(h('span', { key: 'er-lik', className: 'text-3xl text-primary' }, '='))
    items.push(box(`Regnestykke ${row + 1} med ${name}, svaret`))
    return h('li', { key: row, className: 'flex flex-wrap items-center gap-2.5', 'aria-label': `Regnestykke ${row + 1} med ${name}` }, ...items)
  })
  return h('ol', { className: 'flex w-full flex-col items-start gap-4', 'aria-label': 'Regnestykkene dine' }, ...rows)
}
