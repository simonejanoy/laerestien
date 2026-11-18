import { Check } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { TaskFigure } from '../../components/ui/TaskFigure'
import type { Level, Operator, SessionTask, TaskType } from '../../types'
import { ANGLE_OPTIONS, SHAPE_OPTIONS, buildManualTask, emptyManualDraft, manualTaskProblem, type ManualDraft, type ManualFigure, type ManualKind } from './manualTask'
import { operators, operatorSymbol } from './taskUtils'

interface ManualTaskFormProps {
  /** Nivået som er valgt på siden – skjemaet starter der. */
  level: Level
  newId: () => string
  /** Den ferdige oppgaven (lagres i utkastet på riktig nivå). */
  onSave: (task: SessionTask) => void
  onCancel: () => void
}

const fieldClass =
  'w-full rounded-md border border-surface bg-background px-3 py-2 text-small text-on-background outline-none focus:border-secondary'
const choiceClass =
  'flex h-[38px] cursor-pointer items-center gap-2 rounded-md border border-surface bg-background px-3 text-small text-on-background has-[:checked]:border-secondary has-[:checked]:bg-surface-light'

const KINDS: [ManualKind, string][] = [
  ['math', 'Regnestykke'],
  ['text', 'Tekstoppgave'],
]
const FIGURES: [ManualFigure, string][] = [
  ['none', 'Ingen figur'],
  ['shape', 'Plan figur'],
  ['angle', 'Vinkel'],
]
const TASK_TYPES: TaskType[] = ['Hoderegning', 'Oppstilling']

/**
 * «Lag selv»: et rent manuelt skjema uten AI. Regnestykker rettes av appen; tekstoppgaver får fasit eller
 * løsningsforslag for læreren og eventuelt en figur appen tegner.
 */
export function ManualTaskForm({ level, newId, onSave, onCancel }: ManualTaskFormProps) {
  const [draft, setDraft] = useState<ManualDraft>(() => emptyManualDraft(level))
  const [touched, setTouched] = useState(false)
  const set = <K extends keyof ManualDraft>(key: K, value: ManualDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const problem = manualTaskProblem(draft)
  const preview = draft.kind === 'text' && draft.figure !== 'none' ? buildManualTask({ ...draft, text: 'x', solution: 'x' }, 'forhandsvisning') : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    const task = buildManualTask(draft, newId())
    if (task) onSave(task)
  }

  return (
    <form onSubmit={submit} aria-label="Lag selv" className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-small text-primary">
          Nivå
          <select aria-label="Nivå" value={draft.level} onChange={(e) => set('level', Number(e.target.value) as Level)} className={`${fieldClass} cursor-pointer`}>
            {[1, 2, 3].map((l) => (
              <option key={l} value={l}>
                Nivå {l}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="pb-1 text-small text-primary">Oppgavetype</legend>
          <div className="flex flex-wrap gap-2">
            {KINDS.map(([kind, label]) => (
              <label key={kind} className={choiceClass}>
                <input type="radio" name="oppgavetype" checked={draft.kind === kind} onChange={() => set('kind', kind)} className="size-4 cursor-pointer accent-primary" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {draft.kind === 'math' ? (
        <>
          <label className="flex flex-col gap-1 text-small text-primary">
            Oppgavetekst
            <input value={draft.instruction} onChange={(e) => set('instruction', e.target.value)} className={fieldClass} />
            <span className="text-xs text-secondary">Instruksjonen eleven ser over regnestykket.</span>
          </label>
          <div className="grid grid-cols-[1fr_5rem_1fr] gap-2.5 sm:grid-cols-[1fr_5rem_1fr_10rem]">
            <label className="flex flex-col gap-1 text-small text-primary">
              Tall 1
              <input inputMode="numeric" value={draft.a} onChange={(e) => set('a', e.target.value)} className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1 text-small text-primary">
              Regneart
              <select aria-label="Regneart" value={draft.operator} onChange={(e) => set('operator', e.target.value as Operator)} className={`${fieldClass} cursor-pointer text-center`}>
                {operators.map((op) => (
                  <option key={op} value={op}>
                    {operatorSymbol(op)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-small text-primary">
              Tall 2
              <input inputMode="numeric" value={draft.b} onChange={(e) => set('b', e.target.value)} className={fieldClass} />
            </label>
            <label className="col-span-3 flex flex-col gap-1 text-small text-primary sm:col-span-1">
              Type
              <select aria-label="Type" value={draft.type} onChange={(e) => set('type', e.target.value as TaskType)} className={`${fieldClass} cursor-pointer`}>
                {TASK_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-secondary">Fasiten regnes ut av appen, og eleven får svaret rettet med en gang.</p>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-small text-primary">
            Oppgavetekst
            <textarea rows={3} value={draft.text} onChange={(e) => set('text', e.target.value)} className={`${fieldClass} resize-y`} />
          </label>
          <label className="flex flex-col gap-1 text-small text-primary">
            Fasit eller løsningsforslag
            <textarea rows={2} value={draft.solution} onChange={(e) => set('solution', e.target.value)} className={`${fieldClass} resize-y`} />
            <span className="text-xs text-secondary">
              Er fasiten ett tall, eller sanne regnestykker når oppgaven ber eleven skrive regnestykker, retter appen svaret. Ellers
              vurderer du svaret selv.
            </span>
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="pb-1 text-small text-primary">Figur (valgfritt)</legend>
            <div className="flex flex-wrap gap-2">
              {FIGURES.map(([figure, label]) => (
                <label key={figure} className={choiceClass}>
                  <input type="radio" name="figur" checked={draft.figure === figure} onChange={() => set('figure', figure)} className="size-4 cursor-pointer accent-primary" />
                  {label}
                </label>
              ))}
            </div>
            {draft.figure === 'shape' && (
              <label className="flex max-w-[16rem] flex-col gap-1 text-small text-primary">
                Figur
                <select aria-label="Figur" value={draft.shape} onChange={(e) => set('shape', e.target.value as ManualDraft['shape'])} className={`${fieldClass} cursor-pointer`}>
                  {SHAPE_OPTIONS.map(([shape, name]) => (
                    <option key={shape} value={shape}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {draft.figure === 'angle' && (
              <div className="flex flex-wrap gap-2.5">
                <label className="flex w-40 flex-col gap-1 text-small text-primary">
                  Vinkeltype
                  <select
                    aria-label="Vinkeltype"
                    value={draft.angleType}
                    onChange={(e) => {
                      const angleType = e.target.value as ManualDraft['angleType']
                      setDraft((d) => ({ ...d, angleType, degrees: angleType === 'acute' ? '45' : angleType === 'right' ? '90' : '120' }))
                    }}
                    className={`${fieldClass} cursor-pointer`}
                  >
                    {ANGLE_OPTIONS.map(([angle, name]) => (
                      <option key={angle} value={angle}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex w-28 flex-col gap-1 text-small text-primary">
                  Grader
                  <input inputMode="numeric" value={draft.degrees} onChange={(e) => set('degrees', e.target.value)} className={fieldClass} />
                </label>
              </div>
            )}
            {preview?.kind === 'text' && preview.figure && (
              <div className="self-start rounded-md border border-surface p-2" aria-label="Forhåndsvisning av figuren">
                <TaskFigure figure={preview.figure} />
              </div>
            )}
          </fieldset>
        </>
      )}

      {touched && problem && (
        <p role="alert" className="text-small text-error">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="neutral" onClick={onCancel}>
          Avbryt
        </Button>
        <Button type="submit">
          <Check className="size-4" strokeWidth={2.2} aria-hidden />
          Lagre oppgave
        </Button>
      </div>
    </form>
  )
}
