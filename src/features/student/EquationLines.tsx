import { Minus, Plus } from 'lucide-react'
import { NumberInput } from '../../components/ui/TaskText'
import { LINE_LABELS, MAX_TERMS, MIN_TERMS, decodeLine, exampleLine, type EquationLine, type EquationSpec } from './equationTemplates'
import { OperatorChoices } from './OperatorChoices'
import type { TextTaskState } from './studentTasks'

interface EquationLinesProps {
  spec: EquationSpec
  state: TextTaskState
  onChange: (index: number, line: EquationLine) => void
}

/**
 * Regnestykke-malene i Multiplikasjon: én linje per regnestykke («Med pluss», «Med gange»), bygd av tallbokser og
 * knapper for regnetegnet – de samme som i Regning. Pluss-linjen kan få flere ledd. Hver linje rettes for seg.
 */
export function EquationLines({ spec, state, onChange }: EquationLinesProps) {
  return (
    <ol className="flex w-full flex-col gap-6">
      {spec.lines.map((kind, i) => {
        const label = LINE_LABELS[kind]
        const line = decodeLine(state.parts?.[i])
        const checked = state.partResults?.[i]
        // En linje som var riktig, låses (og beholder «Riktig.»); resten kan rettes til eleven er ferdig.
        const locked = state.submitted || checked === true
        const shownResult = checked === true || (state.result !== undefined && checked !== undefined)
        const set = (patch: Partial<EquationLine>) => onChange(i, { ...line, ...patch })
        const setTerm = (k: number, value: string) => set({ terms: line.terms.map((t, j) => (j === k ? value : t)) })

        return (
          <li key={kind} data-line={kind} className="flex flex-col gap-3">
            <p className="text-h3 text-primary">{label}</p>
            <div className="flex flex-wrap items-center gap-2 text-2xl text-primary" aria-label={`Regnestykket ${label.toLowerCase()}`}>
              {/* Hver bit brytes for seg på smal skjerm. Tegnet mellom senere ledd viser regnetegnet eleven valgte. */}
              {line.terms.map((term, k) => [
                k === 1 && (
                  <OperatorChoices key={`tegn-${k}`} value={line.operator} disabled={locked} onChange={(operator) => set({ operator })} label={`${label}: velg regnetegnet`} size="sm" />
                ),
                k > 1 && (
                  <span key={`tegn-${k}`} aria-hidden className="w-5 text-center">
                    {line.operator || '?'}
                  </span>
                ),
                <NumberInput key={`tall-${k}`} value={term} label={`${label}: tall ${k + 1}`} readOnly={locked} onChange={(v) => setTerm(k, v)} />,
              ])}
              <span aria-hidden>=</span>
              <NumberInput value={line.result} label={`${label}: svar`} readOnly={locked} onChange={(result) => set({ result })} />
            </div>

            {kind === 'plus' && !locked && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={line.terms.length >= MAX_TERMS}
                  onClick={() => set({ terms: [...line.terms, ''] })}
                  className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-secondary bg-background px-3 text-small text-primary hover:bg-surface-light disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="size-4" aria-hidden />
                  legg til tall
                </button>
                <button
                  type="button"
                  disabled={line.terms.length <= MIN_TERMS}
                  onClick={() => set({ terms: line.terms.slice(0, -1) })}
                  className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-secondary bg-background px-3 text-small text-primary hover:bg-surface-light disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Minus className="size-4" aria-hidden />
                  fjern tall
                </button>
              </div>
            )}

            {shownResult && (
              <p className="text-body text-primary">
                {checked ? 'Riktig.' : state.result === 'revealed' ? `Ikke riktig. Eksempel på riktig svar: ${exampleLine(kind, spec)}` : 'Ikke riktig.'}
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}
