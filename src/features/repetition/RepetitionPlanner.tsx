import { CheckCircle2, ChevronDown, LoaderCircle, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { AiError, SLOW_AI_HINT, newTaskId, requestTasks, subjectContext, toSessionTask } from '../../ai/client'
import { MAX_PER_LEVEL } from '../../ai/contract'
import { isCompletePackage } from '../../ai/drafts'
import { buildLevelContexts, toAiProfile } from '../../ai/referenceTasks'
import { profileForSkills } from '../../ai/sessionProfile'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { useSlowAiHint } from '../../hooks/useSlowAiHint'
import { loadAnswers } from '../../lib/results'
import type { Level, Session, SessionTask } from '../../types'
import {
  PERIODS,
  PLAN_FALLBACK_NOTICE,
  analyze,
  planOrder,
  rankAreas,
  skillTitle,
  skillTopic,
  suggestAreas,
  type AreaResult,
  type PeriodId,
} from './analysis'
import type { AnswerRecord } from './answers'
import { ordersForAreas } from './plan'
import { clearAreaSelection, loadAreaSelection, saveAreaSelection } from './selectionStorage'

interface RepetitionPlannerProps {
  session: Session
  period: PeriodId
  /** Utkastet slik det er nå (oppgavesettet AI-en skal unngå å gjenta). */
  tasks: SessionTask[]
  /** Oppgavene legges i utkastet, merket «AI-generert · ikke gjennomgått». Læreren lagrer med «Lagre endringer». */
  onAdd: (tasks: SessionTask[]) => void
}

const fieldClass =
  'w-full rounded-md border border-surface bg-background px-3 py-2 text-small text-on-background outline-none focus:border-secondary'
const percent = (share: number) => `${Math.round(share * 100)} %`

/**
 * «Repetisjon ut fra resultatene» (bare for læreren): tre områder for økta – de elevene har svart feil på oftest, eller
 * de første i temaplanen når det ikke er nok elevsvar – med en kort forklaring. «Endre eller legg til områder» åpner hele
 * listen. Valget lagres for økta. AI-en lager oppgaver på alle tre nivåene for de valgte områdene, med de samme
 * referansebankene og kontrollene som ellers, og får bare en anonym oppsummering.
 */
export function RepetitionPlanner({ session, period, tasks: currentTasks, onAdd }: RepetitionPlannerProps) {
  const { profile: teacher } = useAuth()
  const classId = teacher?.classId ?? '4A'
  const [records, setRecords] = useState<AnswerRecord[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    loadAnswers(classId)
      .then((r) => active && setRecords(r))
      .catch((error: unknown) => {
        console.error('Kunne ikke hente elevsvarene:', error)
        if (!active) return
        setLoadError(true)
        setRecords([])
      })
    return () => {
      active = false
    }
  }, [classId])

  if (records === null) {
    return (
      <Frame period={period}>
        <p className="flex items-center gap-2 text-small text-secondary">
          <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden />
          Henter resultatene …
        </p>
      </Frame>
    )
  }
  return <Planner key={`${classId}:${session.id}`} session={session} period={period} records={records} loadError={loadError} tasks={currentTasks} onAdd={onAdd} />
}

function Frame({ period, children }: { period: PeriodId; children: ReactNode }) {
  return (
    <section aria-labelledby="repetisjon-tittel" className="flex flex-col gap-4 rounded-lg border border-surface bg-surface-light p-4">
      <div className="flex flex-col gap-0.5">
        <h2 id="repetisjon-tittel" className="flex items-center gap-2 text-h3 text-primary">
          <Sparkles className="size-5" aria-hidden />
          Repetisjon ut fra resultatene
        </h2>
        <p className="text-small text-secondary">
          {PERIODS[period].title}: områdene elevene har strevd mest med. Du bestemmer hva som repeteres.
        </p>
      </div>
      {children}
    </section>
  )
}

interface PlannerProps {
  session: Session
  period: PeriodId
  records: AnswerRecord[]
  loadError: boolean
  tasks: SessionTask[]
  onAdd: (tasks: SessionTask[]) => void
}

function Planner({ session, period, records, loadError, tasks: currentTasks, onAdd }: PlannerProps) {
  const sessionSkills = useMemo(() => session.skillIds ?? [], [session.skillIds])
  const areas = useMemo(() => rankAreas(records, period), [records, period])
  const suggestion = useMemo(() => suggestAreas(records, period, sessionSkills), [records, period, sessionSkills])
  const allSkills = useMemo(() => planOrder(period, sessionSkills), [period, sessionSkills])
  // Lærerens lagrede valg for økta, ellers forslaget.
  const [selected, setSelected] = useState<string[]>(() => loadAreaSelection(session.id, allSkills) ?? suggestion.skills)
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [count, setCount] = useState('2')
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{ level: Level; titles: string; ok: boolean; text: string }[] | null>(null)
  const slow = useSlowAiHint(loading, 'tasks')

  const isSuggestion = selected.length === suggestion.skills.length && selected.every((s) => suggestion.skills.includes(s))
  const resultBySkill = new Map<string, AreaResult>([...areas.ranked, ...areas.insufficient].map((r) => [r.skill, r]))

  const choose = (next: string[]) => {
    setSelected(next)
    saveAreaSelection(session.id, next)
  }
  const toggle = (skill: string) => choose(selected.includes(skill) ? selected.filter((s) => s !== skill) : [...selected, skill])
  const reset = () => {
    clearAreaSelection(session.id)
    setSelected(suggestion.skills)
  }

  const n = Number(count)
  const invalid =
    selected.length === 0
      ? 'Velg minst ett område.'
      : !/^\d+$/.test(count.trim()) || n < 1
        ? 'Antall oppgaver må være et positivt heltall.'
        : n > MAX_PER_LEVEL
          ? `Du kan bestille høyst ${MAX_PER_LEVEL} oppgaver per nivå om gangen.`
          : null

  const generate = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (invalid) return
    setLoading(true)
    setResults(null)
    const orders = ordersForAreas(analyze(records, period), selected, n)
    const settled = await Promise.allSettled(
      orders.map(async (order) => {
        const titles = order.skills.map(skillTitle).join(', ')
        const profile = profileForSkills(order.skills, `Repetisjon: ${titles}.`)
        if (!profile) throw new AiError(`Fant ikke området i årsplanen (${titles}).`)
        return requestTasks({
          kind: 'general',
          lesson: {
            ...subjectContext(session.className),
            topic: session.topic,
            sessionHeading: session.heading,
            sessionDescription: session.description,
            sessionGoals: session.goals,
          },
          perLevel: order.count,
          targetLevels: [order.level],
          officialGoals: '',
          wishes: notes.trim(),
          levels: buildLevelContexts(session.levels, currentTasks, profile).filter((l) => l.level === order.level),
          profile: toAiProfile(profile),
          repetition: { lines: order.lines, source: 'real' },
        })
      }),
    )
    const added: SessionTask[] = []
    const summary = settled.map((outcome, i) => {
      const order = orders[i]
      const titles = order.skills.map(skillTitle).join(', ')
      if (outcome.status === 'rejected') {
        const reason = outcome.reason instanceof AiError ? outcome.reason.message : 'Noe gikk galt.'
        return { level: order.level, titles, ok: false, text: `${reason} Ingen oppgaver ble lagt til for dette.` }
      }
      const { tasks, message, warning, meta } = outcome.value
      // Alt eller ingenting per bestilling: bare nøyaktig det bestilte antallet legges i utkastet.
      if (!isCompletePackage(tasks, order.count, [order.level])) {
        return { level: order.level, titles, ok: false, text: warning ?? 'AI-en laget ikke hele det bestilte antallet. Ingen oppgaver ble lagt til for dette.' }
      }
      added.push(...tasks.map((t) => toSessionTask(t, newTaskId(session.id), meta)))
      return { level: order.level, titles, ok: true, text: message || `${tasks.length} oppgaver lagt til.` }
    })
    if (added.length > 0) onAdd(added)
    setResults(summary)
    setLoading(false)
  }

  // Hele listen gruppert etter tema, i temaplanens rekkefølge.
  const groups = allSkills.reduce<{ topic: string; skills: string[] }[]>((list, skill) => {
    const topic = skillTopic(skill) || 'Andre områder'
    const group = list.find((g) => g.topic === topic)
    if (group) group.skills.push(skill)
    else list.push({ topic, skills: [skill] })
    return list
  }, [])

  return (
    <Frame period={period}>
      <DataNotice answers={areas.answers} students={areas.students} noResults={areas.ranked.length === 0} partly={suggestion.fromPlan} loadError={loadError} />

      <div className="flex flex-col gap-2">
        <h3 className="text-small font-medium text-primary">Valgte områder ({selected.length})</h3>
        {selected.length === 0 ? (
          <p className="text-small text-secondary">Ingen områder er valgt. Åpne listen under og velg minst ett.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {selected.map((skill) => (
              <li key={skill} className="flex items-start gap-2.5 rounded-md border border-surface bg-background px-3 py-2">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="text-small text-on-background">
                    <span className="sr-only">Valgt: </span>
                    {skillTitle(skill)}
                    {skillTopic(skill) && <span className="text-secondary"> · {skillTopic(skill)}</span>}
                  </span>
                  <span className="text-xs text-secondary">{suggestion.reasons[skill] ?? 'Valgt av deg.'}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="repetisjon-alle-omrader"
            onClick={() => setOpen((o) => !o)}
            className="flex h-[38px] cursor-pointer items-center gap-2 rounded-[7px] border border-surface bg-background px-3.5 text-small text-primary hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Endre eller legg til områder
            <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {!isSuggestion && (
            <button
              type="button"
              onClick={reset}
              className="flex h-[38px] cursor-pointer items-center gap-2 rounded-[7px] px-3 text-small text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <RotateCcw className="size-4" aria-hidden />
              Tilbakestill til forslaget
            </button>
          )}
        </div>

        {open && (
          <fieldset id="repetisjon-alle-omrader" className="flex flex-col gap-3 rounded-md border border-surface bg-background p-3">
            <legend className="px-1 text-small font-medium text-primary">Alle områder i perioden</legend>
            <p className="text-xs text-secondary">Kryss av for områdene som skal repeteres. Valget lagres for økta.</p>
            {groups.map((group) => (
              <div key={group.topic} className="flex flex-col gap-1.5">
                <p className="text-xs font-medium tracking-wide text-secondary uppercase">{group.topic}</p>
                <ul className="flex flex-col gap-1">
                  {group.skills.map((skill) => {
                    const checked = selected.includes(skill)
                    return (
                      <li key={skill}>
                        <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-small text-on-background hover:bg-surface-light">
                          <input type="checkbox" checked={checked} onChange={() => toggle(skill)} className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary" />
                          <span className="flex min-w-0 flex-col">
                            <span>
                              {skillTitle(skill)}
                              {checked && <span className="ml-2 rounded-full bg-surface-light px-2 py-0.5 text-xs text-primary">Valgt</span>}
                            </span>
                            <span className="text-xs text-secondary">{statusOf(resultBySkill.get(skill))}</span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </fieldset>
        )}
      </div>

      <form onSubmit={generate} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
          <label className="flex flex-col gap-1 text-small text-primary">
            Egne observasjoner (valgfritt)
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="F.eks. hva du har sett i timene. Ikke skriv navn eller andre elevopplysninger."
              className={`${fieldClass} resize-y`}
            />
          </label>
          <label className="flex flex-col gap-1 text-small text-primary">
            Oppgaver per nivå
            <input type="number" inputMode="numeric" min={1} max={MAX_PER_LEVEL} step={1} value={count} onChange={(e) => setCount(e.target.value)} aria-invalid={touched && !!invalid} className={fieldClass} />
          </label>
        </div>
        {touched && invalid && (
          <p role="alert" className="text-small text-error">
            {invalid}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={loading || (touched && !!invalid)}>
            {loading ? <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {loading ? 'Lager oppgaver …' : 'Lag repetisjonsoppgaver'}
          </Button>
          <p aria-live="polite" className="text-xs text-secondary">
            {loading ? (slow ? SLOW_AI_HINT : 'AI-en lager og kontrollerer oppgavene. Det kan ta litt tid.') : 'Oppgavene lages på alle tre nivåene for de valgte områdene.'}
          </p>
        </div>
      </form>

      {results && (
        <div role="status" className="flex flex-col gap-2 rounded-md bg-background px-3 py-2 text-small text-on-background">
          {results.map((r, i) => (
            <p key={i} className={r.ok ? '' : 'text-error'}>
              <span className="font-medium">
                Nivå {r.level} – {r.titles}:
              </span>{' '}
              {r.ok ? <>Hvorfor: {r.text}</> : r.text}
            </p>
          ))}
          {results.some((r) => r.ok) && (
            <p className="text-secondary">
              Oppgavene ligger i utkastet, merket «AI-generert · ikke gjennomgått». Behold, rediger eller fjern dem, og trykk
              «Lagre endringer».
            </p>
          )}
        </div>
      )}
    </Frame>
  )
}

/** Status i hele listen: andel feil svar når det er nok grunnlag – uten navn og nivå. */
function statusOf(result: AreaResult | undefined) {
  if (!result) return 'Ingen elevsvar ennå'
  if (!result.eligible) return `For lite grunnlag (${result.answered} svar)`
  return `Feil på ${percent(1 - result.share)} av ${result.answered} svar`
}

/** Hva forslaget bygger på: klassens svar, eller temaplanen når det ikke er nok svar. */
function DataNotice({ answers, students, noResults, partly, loadError }: { answers: number; students: number; noResults: boolean; partly: boolean; loadError: boolean }) {
  if (noResults) {
    return (
      <p role="note" className="rounded-md border border-dashed border-needs-support bg-background px-3 py-2 text-small text-on-background">
        <span className="mr-2 rounded-full bg-surface-variant px-2 py-0.5 text-xs font-medium">Fra temaplanen</span>
        {loadError && 'Fikk ikke hentet klassens svar. '}
        {PLAN_FALLBACK_NOTICE}
      </p>
    )
  }
  return (
    <p className="text-xs text-secondary">
      Bygger på {answers} svar fra {students} elever i perioden. Et område regnes som en felles utfordring først når det har
      nok svar fra flere elever.
      {partly && ' Der det ikke er nok svar, er områdene hentet fra temaplanen.'}
    </p>
  )
}
