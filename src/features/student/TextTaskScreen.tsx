import { ChevronRight } from 'lucide-react'
import {
  PATTERN_COLORS,
  SYMBOL_NAMES,
  blankRowIn,
  boxesComplete,
  colorOptions,
  formatExpected,
  itemOptions,
  joinBoxAnswers,
  splitBoxAnswers,
  symbolRowIn,
  withoutColorRow,
  withoutDotSentences,
  type BlankRow,
} from '../../ai/patternDisplay'
import { TaskFigure } from '../../components/ui/TaskFigure'
import type { TextTask } from '../../types'
import { checkTextAnswer, initialTextState, showsSolution, solutionHeading, type TextTaskState } from './studentTasks'
import { TaskStepper } from './TaskStepper'
import { useTaskState, type ControlledTaskState } from './useTaskState'

interface TextTaskScreenProps {
  task: TextTask
  index: number
  total: number
  onNext: () => void
  /** Bare i lærerens forhåndsvisning: tilstanden holdes utenfor, så den beholdes når læreren blar. */
  controlled?: ControlledTaskState<TextTaskState>
  /** Økta hører til Mønster og algoritmer: egen melding og knapp for svar som ikke rettes automatisk. */
  patternTopic?: boolean
}

/**
 * Tekstoppgave for eleven: les, skriv svaret og lever. Oppgaver med et kort svar som kan rettes (Mønster og
 * algoritmer: tall, tallrekke, figur eller farge) rettes med en gang: «Riktig!», ett nytt forsøk etter første feil,
 * og deretter riktig svar – med løsningsforslaget når eleven kan se det. Andre tekstoppgaver rettes ikke av appen.
 */
export function TextTaskScreen({ task, index, total, onNext, controlled, patternTopic = false }: TextTaskScreenProps) {
  const [state, setState] = useTaskState(initialTextState, controlled)
  const { answer, submitted, result } = state
  const isLast = index === total - 1
  const auto = !!task.expected
  // Fargemønstre og figurtall: fargerekka og antallene vises i figuren, så de vises ikke i teksten i tillegg.
  const text =
    task.figure?.kind === 'colors' ? withoutColorRow(task.text, task.figure.items) : task.figure?.kind === 'dots' ? withoutDotSentences(task.text) : task.text
  // Mønster og algoritmer: tallrekka får en inputboks for hvert tomme felt i stedet for én tekstboks under.
  const row = task.answerBoxes ? blankRowIn(text) : null
  // Fargen eller figuren på en plass: svaralternativene er leddene i rekka (laget av appen, ikke av AI-en).
  const symbols = symbolRowIn(task.text)
  const choices =
    task.expected?.kind !== 'item'
      ? null
      : task.figure?.kind === 'colors' && task.expected.value in PATTERN_COLORS
        ? colorOptions(task.figure.items)
        : symbols && symbols.includes(task.expected.value)
          ? itemOptions(symbols)
          : null
  const ready = row ? boxesComplete(answer, row.blanks) : answer.trim() !== ''
  const change = (value: string) => setState({ ...state, answer: value, result: result === 'retry' || result === 'several' ? undefined : result })
  const finished = result === 'correct' || result === 'revealed'

  return (
    <section className="flex flex-col items-center gap-[26px] rounded-3xl border border-card-border bg-background p-8">
      <p className="w-full text-small text-muted uppercase">Oppgave {index + 1}</p>

      {row ? (
        <BoxRow row={row} answer={answer} readOnly={submitted} onChange={change} />
      ) : (
        <h2 className="w-full text-h2 whitespace-pre-wrap text-primary">{text}</h2>
      )}
      {task.figure && <TaskFigure figure={task.figure} />}

      {choices && <ItemChoices options={choices} value={answer} disabled={submitted} onChange={change} />}

      {!row && !choices && (
        <label className="flex w-full flex-col gap-2 text-body text-primary">
          Ditt svar
          <textarea
            autoFocus
            rows={auto ? 2 : 4}
            value={answer}
            readOnly={submitted}
            onChange={(e) => change(e.target.value)}
            placeholder={auto ? 'Skriv svaret ditt her.' : 'Skriv svaret ditt her. Du kan også vise hvordan du tenkte.'}
            className="w-full resize-y rounded-xl border-2 border-secondary bg-background px-[18px] py-3 text-xl text-on-background outline-none placeholder:text-lg placeholder:text-secondary read-only:bg-tertiary"
          />
        </label>
      )}

      {result === 'several' && (
        <p role="status" className="w-full text-body text-primary">
          Skriv bare ett svar.
        </p>
      )}
      {result === 'retry' && (
        <p role="status" className="w-full text-body text-primary">
          Ikke riktig. Prøv én gang til.
        </p>
      )}
      {finished && task.expected && (
        <div role="status" className="flex w-full flex-col gap-3 rounded-xl bg-surface-light p-5 text-body text-primary">
          <p className="text-h3">{result === 'correct' ? 'Riktig!' : `Riktig svar: ${formatExpected(task.expected)}`}</p>
          {showsSolution(task) && (
            <div className="flex flex-col gap-1">
              <p className="text-small text-muted">{solutionHeading(task)}</p>
              <p className="whitespace-pre-wrap">{task.solution}</p>
            </div>
          )}
        </div>
      )}
      {submitted && !auto && (
        <p role="status" className="w-full text-body text-secondary">
          {/* Svarene lagres ikke. I Mønster og algoritmer sier meldingen det ærlig; andre temaer har meldingen som før. */}
          {patternTopic ? 'Ferdig! Fortell læreren hva du svarte.' : 'Svaret ditt er levert. Læreren ser på det.'}
        </p>
      )}

      <hr className="h-px w-full border-0 bg-rule" />

      <div className="flex min-h-[125px] w-full items-center justify-between gap-4">
        <span className="w-[236px] shrink-0" aria-hidden />
        <TaskStepper total={total} current={index} currentDone={submitted} />
        <button
          type="button"
          disabled={!submitted && !ready}
          onClick={submitted ? onNext : () => setState(checkTextAnswer(state, task))}
          className="flex h-[52px] w-[224px] shrink-0 cursor-pointer items-center justify-center gap-[47px] rounded-lg bg-primary text-body text-on-primary hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitted ? (isLast ? 'Ferdig' : 'Neste oppgave') : auto ? 'Sjekk svaret mitt' : patternTopic ? 'Ferdig med oppgaven' : 'Lever svaret'}
          {submitted && <ChevronRight className="size-6" />}
        </button>
      </div>
    </section>
  )
}

/**
 * Svaralternativene til et spørsmål om fargen eller figuren på en plass: én knapp per ledd i rekka som bare viser en
 * fylt sirkel i fargen eller figuren (▲, ●, ■). Navnet («gul», «trekant») ligger som skjult tekst for skjermlesere.
 */
function ItemChoices({ options, value, disabled, onChange }: { options: string[]; value: string; disabled: boolean; onChange: (value: string) => void }) {
  const colors = options.every((o) => o in PATTERN_COLORS)
  return (
    <div role="radiogroup" aria-label={colors ? 'Velg fargen' : 'Velg figuren'} className="flex w-full flex-wrap justify-center gap-4">
      {options.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={colors ? color : SYMBOL_NAMES[color]}
          disabled={disabled}
          onClick={() => onChange(color)}
          className={`flex size-16 cursor-pointer items-center justify-center rounded-xl border-2 text-primary disabled:cursor-default ${
            value === color ? 'border-primary bg-surface-light' : 'border-secondary bg-background'
          }`}
        >
          {colors ? (
            <span aria-hidden className="block size-9 rounded-full border-2 border-primary" style={{ backgroundColor: PATTERN_COLORS[color] }} />
          ) : (
            <span aria-hidden className="text-3xl leading-none">
              {color}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/**
 * Oppgaveteksten med tallrekka i midten: tallene som tekst og en liten inputboks der et tall mangler. Rekka brytes
 * over flere linjer på smal skjerm. Svarene lagres som én tekst («22, 23, 24»), som andre tekstsvar.
 */
function BoxRow({ row, answer, readOnly, onChange }: { row: BlankRow; answer: string; readOnly: boolean; onChange: (value: string) => void }) {
  const values = splitBoxAnswers(answer, row.blanks)
  const set = (i: number, value: string) => onChange(joinBoxAnswers(values.map((v, j) => (j === i ? value.replace(/\D/g, '').slice(0, 6) : v))))
  return (
    <div className="flex w-full flex-col gap-4 text-h2 text-primary">
      {row.before && <h2 className="whitespace-pre-wrap">{row.before}</h2>}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3" aria-label="Tallrekke">
        {row.items.map((item, i) => (
          <li key={i} className="flex items-center gap-2">
            {item.kind === 'number' && <span>{item.value}</span>}
            {item.kind === 'more' && <span aria-label="og så videre">…</span>}
            {item.kind === 'blank' && (
              <input
                autoFocus={item.index === 0 && !readOnly}
                inputMode="numeric"
                aria-label={`Tall som mangler, nr. ${item.index + 1}`}
                value={values[item.index]}
                readOnly={readOnly}
                onChange={(e) => set(item.index, e.target.value)}
                className="h-12 w-16 rounded-lg border-2 border-secondary bg-background text-center text-xl text-on-background outline-none read-only:bg-tertiary"
              />
            )}
            {i < row.items.length - 1 && <span aria-hidden>,</span>}
          </li>
        ))}
      </ol>
      {row.after.trim() && <p className="whitespace-pre-wrap">{row.after.trim()}</p>}
    </div>
  )
}
