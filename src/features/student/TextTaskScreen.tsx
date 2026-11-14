import { ChevronRight } from 'lucide-react'
import {
  PATTERN_COLORS,
  SYMBOL_NAMES,
  blankRowIn,
  boxesComplete,
  colorOptions,
  formatExpected,
  formatPart,
  itemOptions,
  joinParts,
  joinBoxAnswers,
  splitBoxAnswers,
  symbolRowIn,
  withoutColorRow,
  withoutDotSentences,
  type BlankRow,
} from '../../ai/patternDisplay'
import { OPERATOR_OPTIONS, asksExplanation, hasDataBlock, labelsIn, lettered, operatorTemplate, questionsIn, withoutOperatorChoices, withoutQuestions } from '../../ai/taskText'
import { TaskFigure } from '../../components/ui/TaskFigure'
import { NumberInput, TaskText } from '../../components/ui/TaskText'
import type { TextTask } from '../../types'
import { checkTextAnswer, initialTextState, showsSolution, solutionHeading, textSlots, typeInSlot, type TaskResultSummary, type TextTaskState } from './studentTasks'
import { TaskStepper } from './TaskStepper'
import { useTaskState, type ControlledTaskState } from './useTaskState'

interface TextTaskScreenProps {
  task: TextTask
  index: number
  total: number
  onNext: () => void
  /** Bare i lærerens forhåndsvisning: tilstanden holdes utenfor, så den beholdes når læreren blar. */
  controlled?: ControlledTaskState<TextTaskState>
  /** Bare i elevvisningen: resultatet når oppgaven er ferdig rettet (lagres for repetisjonen). */
  onResult?: (result: TaskResultSummary) => void
  /** Bare i elevvisningen: hvilke oppgaver som er levert (til trinnene nederst). */
  doneSteps?: boolean[]
  /**
   * Økta hører til Mønster og algoritmer eller Regning: svarene lagres ikke, så oppgaver som ikke rettes automatisk får
   * meldingen «Ferdig! Fortell læreren hva du svarte.» og knappen «Ferdig med oppgaven». Andre temaer har meldingen som før.
   */
  honestDone?: boolean
  /** Regning: oppgaver med a) og b) får ett skrivefelt under hver del. Andre temaer viser dem som før. */
  splitParts?: boolean
  /** Regning: tomme ruter i tabeller og □ i likninger vises alltid som inputbokser (se textSlots). */
  textBoxes?: boolean
}

/**
 * Tekstoppgave for eleven: les, skriv svaret og lever. Oppgaver med et kort svar som kan rettes (Mønster og
 * algoritmer: tall, tallrekke, figur eller farge; Regning: regnetegn, tomme ruter i tabeller og □ i likninger) rettes
 * med en gang: «Riktig!», ett nytt forsøk etter første feil, og deretter riktig svar – med løsningsforslaget når eleven
 * kan se det. Andre tekstoppgaver rettes ikke av appen.
 */
export function TextTaskScreen({ task, index, total, onNext, controlled, onResult, doneSteps, honestDone = false, splitParts = false, textBoxes = false }: TextTaskScreenProps) {
  const [state, setState] = useTaskState(initialTextState, controlled, onResult)
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
  // Regning: regnetegnet som mangler («10 __ 5 = 50») velges med fire knapper laget av appen, og setningen som ramser
  // opp tegnene vises ikke.
  const operatorButtons = task.expected?.kind === 'operator' && text.split('\n').some((line) => operatorTemplate(line) !== null)
  const shown = operatorButtons ? withoutOperatorChoices(text) : text
  // Regning: tomme ruter i tabeller og □ i likninger blir inputbokser – når antallet stemmer med svaret som rettes.
  const { total: slotTotal, inText } = textSlots(task, shown, textBoxes)
  // Regning: flere spørsmål i samme oppgave – hvert spørsmål står over sitt eget svarfelt (tallboks, regnetegn eller
  // navn fra diagrammet eller tabellen) og vises ikke i teksten i tillegg.
  const questionParts = task.expected?.kind === 'parts' && task.expected.parts.every((p) => questionsIn(shown).includes(p.question)) ? task.expected.parts : null
  const body = questionParts ? withoutQuestions(shown, questionParts.map((p) => p.question)) : shown
  const askedValues = questionParts ? questionParts.map((_, i) => state.parts?.[i] ?? '') : []
  const changeAsked = (i: number, value: string) => {
    const next = askedValues.map((v, k) => (k === i ? value : v))
    setState({ ...state, parts: next, answer: joinParts(next), result: result === 'retry' ? undefined : result })
  }
  // Oppgaver med a) og b) (helst ikke i Regning): ett skrivefelt under hver del.
  const parts = splitParts && !row && !inText && !operatorButtons && !choices && !questionParts ? lettered(shown) : null
  const explain = (inText || operatorButtons || !!questionParts) && asksExplanation(body)
  const partAnswers = parts ? parts.parts.map((_, i) => state.parts?.[i] ?? '') : []
  const ready = row
    ? boxesComplete(answer, row.blanks)
    : inText
      ? boxesComplete(answer, slotTotal)
      : questionParts
        ? askedValues.every((v) => v.trim() !== '')
        : parts
        ? partAnswers.every((p) => p.trim() !== '')
        : answer.trim() !== ''
  const change = (value: string) => setState({ ...state, answer: value, result: result === 'retry' || result === 'several' ? undefined : result })
  const slotValues = splitBoxAnswers(answer, slotTotal)
  const changePart = (i: number, value: string) => {
    const next = partAnswers.map((p, k) => (k === i ? value : p))
    setState({ ...state, parts: next, answer: parts!.parts.map((p, k) => `${p.label} ${next[k]}`.trim()).join('\n') })
  }
  const finished = result === 'correct' || result === 'revealed'

  return (
    <section className="flex flex-col items-center gap-[26px] rounded-3xl border border-card-border bg-background p-8">
      <p className="w-full text-small text-muted uppercase">Oppgave {index + 1}</p>

      {row ? (
        <BoxRow row={row} answer={answer} readOnly={submitted} onChange={change} />
      ) : parts ? (
        <div className="flex w-full flex-col gap-5 text-primary">
          {parts.intro.trim() && <h2 className="text-h2 whitespace-pre-wrap">{parts.intro.trim()}</h2>}
          {parts.parts.map((part, i) => (
            <label key={part.label} className="flex flex-col gap-2 text-h2">
              <span className="whitespace-pre-wrap">
                {part.label} {part.text}
              </span>
              <textarea
                rows={2}
                value={partAnswers[i]}
                readOnly={submitted}
                onChange={(e) => changePart(i, e.target.value)}
                aria-label={`Svar på ${part.label}`}
                placeholder="Skriv svaret ditt her."
                className="w-full resize-y rounded-xl border-2 border-secondary bg-background px-[18px] py-3 text-xl text-on-background outline-none placeholder:text-lg placeholder:text-secondary read-only:bg-tertiary"
              />
            </label>
          ))}
        </div>
      ) : hasDataBlock(body) || inText || operatorButtons ? (
        // Regning: diagrammer og tabeller fra tekstformatet, og bokser der eleven svarer i teksten.
        <TaskText
          as="h2"
          text={body}
          className="w-full text-h2 text-primary"
          slots={inText ? { values: slotValues, readOnly: submitted, onChange: (i, v) => change(typeInSlot(answer, slotTotal, i, v)) } : undefined}
          operator={operatorButtons ? answer : undefined}
        />
      ) : (
        <h2 className="w-full text-h2 whitespace-pre-wrap text-primary">{questionParts ? body : text}</h2>
      )}
      {task.figure && <TaskFigure figure={task.figure} />}

      {questionParts && (
        <ol className="flex w-full flex-col gap-6">
          {questionParts.map((part, i) => {
            const checked = state.partResults?.[i]
            const shownResult = result !== undefined && checked !== undefined
            return (
              <li key={i} className="flex flex-col gap-3">
                <p className="text-h2 text-primary">{part.question}</p>
                {part.answer.kind === 'number' ? (
                  <NumberInput value={askedValues[i]} label={part.question} readOnly={submitted} onChange={(v) => changeAsked(i, v)} />
                ) : part.answer.kind === 'operator' ? (
                  <OperatorChoices value={askedValues[i]} disabled={submitted} onChange={(v) => changeAsked(i, v)} label={part.question} align="start" />
                ) : (
                  <NameChoices options={labelsIn(task.text)} value={askedValues[i]} disabled={submitted} onChange={(v) => changeAsked(i, v)} label={part.question} />
                )}
                {shownResult && (
                  <p className="text-body text-primary">
                    {checked ? 'Riktig.' : result === 'revealed' ? `Riktig svar: ${formatPart(part.answer)}` : 'Ikke riktig.'}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {choices && <ItemChoices options={choices} value={answer} disabled={submitted} onChange={change} />}
      {operatorButtons && <OperatorChoices value={answer} disabled={submitted} onChange={change} />}

      {explain && (
        <label className="flex w-full flex-col gap-2 text-body text-primary">
          Forklar hvordan du tenkte
          <textarea
            rows={3}
            value={state.explanation ?? ''}
            readOnly={submitted}
            onChange={(e) => setState({ ...state, explanation: e.target.value })}
            placeholder="Skriv forklaringen din her."
            className="w-full resize-y rounded-xl border-2 border-secondary bg-background px-[18px] py-3 text-xl text-on-background outline-none placeholder:text-lg placeholder:text-secondary read-only:bg-tertiary"
          />
        </label>
      )}

      {!row && !choices && !operatorButtons && !inText && !parts && !questionParts && (
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
          <p className="text-h3">
            {result === 'correct' ? 'Riktig!' : questionParts ? 'Se riktig svar ved hvert spørsmål.' : `Riktig svar: ${formatExpected(task.expected)}`}
          </p>
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
          {/* Svarene lagres ikke. I Mønster og algoritmer og Regning sier meldingen det ærlig; andre temaer har meldingen som før. */}
          {honestDone ? 'Ferdig! Fortell læreren hva du svarte.' : 'Svaret ditt er levert. Læreren ser på det.'}
        </p>
      )}

      <hr className="h-px w-full border-0 bg-rule" />

      <div className="flex min-h-[125px] w-full items-center justify-between gap-4">
        <span className="w-[236px] shrink-0" aria-hidden />
        <TaskStepper total={total} current={index} currentDone={submitted} done={doneSteps} />
        <button
          type="button"
          disabled={!submitted && !ready}
          onClick={submitted ? onNext : () => setState(checkTextAnswer(state, task))}
          className="flex h-[52px] w-[224px] shrink-0 cursor-pointer items-center justify-center gap-[47px] rounded-lg bg-primary text-body text-on-primary hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitted ? (isLast ? 'Ferdig' : 'Neste oppgave') : auto ? 'Sjekk svaret mitt' : honestDone ? 'Ferdig med oppgaven' : 'Lever svaret'}
          {submitted && <ChevronRight className="size-6" />}
        </button>
      </div>
    </section>
  )
}

/** Regning: fire knapper for regnetegnet (laget av appen, ikke av AI-en). */
function OperatorChoices({
  value,
  disabled,
  onChange,
  label = 'Velg regnetegnet',
  align = 'center',
}: {
  value: string
  disabled: boolean
  onChange: (value: string) => void
  label?: string
  align?: 'center' | 'start'
}) {
  const names: Record<string, string> = { '+': 'pluss', '−': 'minus', '·': 'gange', ':': 'dele' }
  return (
    <div role="radiogroup" aria-label={label} className={`flex w-full flex-wrap gap-4 ${align === 'center' ? 'justify-center' : 'justify-start'}`}>
      {OPERATOR_OPTIONS.map((sign) => (
        <button
          key={sign}
          type="button"
          role="radio"
          aria-checked={value === sign}
          aria-label={names[sign]}
          disabled={disabled}
          onClick={() => onChange(sign)}
          className={`flex size-16 cursor-pointer items-center justify-center rounded-xl border-2 text-3xl leading-none text-primary disabled:cursor-default ${
            value === sign ? 'border-primary bg-surface-light' : 'border-secondary bg-background'
          }`}
        >
          {sign}
        </button>
      ))}
    </div>
  )
}

/** Regning: svarknapper med navnene i diagrammet eller tabellen («Fotball», «Onsdag»), laget av appen. */
function NameChoices({ options, value, disabled, onChange, label }: { options: string[]; value: string; disabled: boolean; onChange: (value: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full flex-wrap gap-3">
      {options.map((name) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={value === name}
          disabled={disabled}
          onClick={() => onChange(name)}
          className={`min-h-12 cursor-pointer rounded-xl border-2 px-5 py-2 text-xl text-primary disabled:cursor-default ${
            value === name ? 'border-primary bg-surface-light' : 'border-secondary bg-background'
          }`}
        >
          {name}
        </button>
      ))}
    </div>
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
