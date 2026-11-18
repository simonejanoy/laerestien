import { LoaderCircle, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { AiError, newTaskId, requestTasks, subjectContext, toSessionTask } from '../../ai/client'
import { AREA_TITLES, MAX_PER_LEVEL, type AiLevel } from '../../ai/contract'
import { isCompletePackage } from '../../ai/drafts'
import { buildLevelContexts, toAiProfile } from '../../ai/referenceTasks'
import { aiProfileFor } from '../../ai/sessionProfile'
import { Button } from '../../components/ui/Button'
import type { Session, SessionTask } from '../../types'

interface AiTaskGeneratorProps {
  session: Session
  /** Utkastet slik det er nå. Noen representative oppgaver per nivå sendes med, så de nye passer inn. */
  tasks: SessionTask[]
  /** Oppgavene legges i utkastet. Læreren lagrer dem med «Lagre endringer». */
  onAdd: (tasks: SessionTask[]) => void
  /** Lukker popupen «Legg til oppgaver» («Avbryt» før noe er lagt til, «Lukk» etterpå). */
  onClose: () => void
}

const fieldClass =
  'w-full rounded-md border border-surface bg-background px-3 py-2 text-small text-on-background outline-none focus:border-secondary'

const ALL_LEVELS: AiLevel[] = [1, 2, 3]

/** Feilmelding for valgene, eller null når bestillingen kan sendes. */
function validationError(levels: AiLevel[], count: string) {
  if (levels.length === 0) return 'Velg minst ett nivå.'
  const n = Number(count)
  if (!/^\d+$/.test(count.trim()) || !Number.isInteger(n) || n < 1) return 'Antall oppgaver må være et positivt heltall.'
  if (n > MAX_PER_LEVEL) return `Du kan bestille høyst ${MAX_PER_LEVEL} oppgaver per nivå om gangen.`
  return null
}

/**
 * «Lag med AI» i popupen «Legg til oppgaver»: generelle oppgaver på nivåene læreren velger, ut fra temaet for økta.
 * Referansebanker, nivåstyring, kvalitetskontroller og utfylling ligger på serveren; læreren får nøyaktig det bestilte
 * antallet per nivå, eller ingen.
 */
export function AiTaskGenerator({ session, tasks: currentTasks, onAdd, onClose }: AiTaskGeneratorProps) {
  // Alle nivåene er valgt som standard. Antallet holdes som tekst, så feltet kan valideres slik læreren skrev det.
  const [selectedLevels, setSelectedLevels] = useState<AiLevel[]>(ALL_LEVELS)
  const [count, setCount] = useState('2')
  const [touched, setTouched] = useState(false)
  const [officialGoals, setOfficialGoals] = useState('')
  const [wishes, setWishes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ count: number; message: string; warning?: string; failed: boolean } | null>(null)

  const invalid = validationError(selectedLevels, count)
  // Fagområdet bestillingen styres etter: øktas egen profil, eller en profil fra årsplanen ut fra undertemaene
  // (repetisjon) eller overskriften (egne økter). Endrer ikke økta.
  const derived = aiProfileFor(session)
  const profile = derived?.profile
  const areas = profile?.area ? [profile.area, ...(profile.secondaryAreas ?? [])].map((a) => AREA_TITLES[a]) : []
  const toggleLevel = (level: AiLevel) =>
    setSelectedLevels((prev) => (prev.includes(level) ? prev.filter((l) => l !== level) : ALL_LEVELS.filter((l) => l === level || prev.includes(l))))

  const generate = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (invalid) return
    const perLevel = Number(count)
    const levels = selectedLevels
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const { tasks, message, warning, incomplete, meta } = await requestTasks({
        kind: 'general',
        lesson: {
          ...subjectContext(session.className),
          topic: session.topic,
          sessionHeading: session.heading,
          sessionDescription: session.description,
          sessionGoals: session.goals,
        },
        perLevel,
        targetLevels: levels,
        officialGoals: officialGoals.trim(),
        wishes: wishes.trim(),
        levels: buildLevelContexts(session.levels, currentTasks, profile).filter((l) => levels.includes(l.level)),
        ...(profile && { profile: toAiProfile(profile) }),
      })
      // Alt eller ingenting: bare en komplett pakke (nøyaktig det bestilte antallet på hvert valgte nivå) legges i utkastet.
      const complete = isCompletePackage(tasks, perLevel, levels)
      if (complete) onAdd(tasks.map((t) => toSessionTask(t, newTaskId(session.id), meta)))
      const failed = !complete && tasks.length > 0
      setResult({
        count: complete ? tasks.length : 0,
        message,
        warning: failed ? `AI-en laget ikke hele det bestilte antallet (${perLevel * levels.length} oppgaver). Ingen oppgaver ble lagt til. Prøv igjen.` : warning,
        failed: failed || !!incomplete,
      })
    } catch (err) {
      if (!(err instanceof AiError)) console.error('Uventet feil ved oppgavegenerering:', err)
      setError(err instanceof AiError ? err.message : 'Noe gikk galt. Prøv igjen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section aria-label="Lag med AI" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-small text-secondary">
          Oppgaver på nivåene du velger om «{session.heading}». De legges i utkastet, merket som AI-generert og ikke
          gjennomgått, og du kan endre dem før og etter du lagrer.
        </p>
        {areas.length > 0 && (
          <p className="text-xs text-secondary">
            Fagområde: {areas.join(', ')}
            {derived?.source !== 'session' && ' (hentet fra årsplanen ut fra undertemaene og overskriften)'}
          </p>
        )}
      </div>

      <form onSubmit={generate} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-small text-primary">
          Kompetansemål (valgfritt)
          <textarea
            rows={2}
            value={officialGoals}
            onChange={(e) => setOfficialGoals(e.target.value)}
            placeholder="Lim inn målteksten ordrett fra læreplanen"
            className={`${fieldClass} resize-y`}
          />
          <span className="text-xs text-secondary">Står feltet tomt, kobler ikke AI-en oppgavene til kompetansemål.</span>
        </label>
        <label className="flex flex-col gap-1 text-small text-primary">
          Andre ønsker (valgfritt)
          <input
            value={wishes}
            onChange={(e) => setWishes(e.target.value)}
            placeholder="F.eks. «tekstoppgaver om penger»"
            className={fieldClass}
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
          <fieldset className="flex flex-col gap-1">
            <legend className="pb-1 text-small text-primary">Velg nivå</legend>
            <div className="flex flex-wrap gap-2">
              {ALL_LEVELS.map((level) => (
                <label
                  key={level}
                  className="flex h-[38px] cursor-pointer items-center gap-2 rounded-md border border-surface bg-background px-3 text-small text-on-background has-[:checked]:border-secondary"
                >
                  <input
                    type="checkbox"
                    checked={selectedLevels.includes(level)}
                    onChange={() => toggleLevel(level)}
                    className="size-4 cursor-pointer accent-primary"
                  />
                  Nivå {level}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-small text-primary">
            Antall per nivå
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_PER_LEVEL}
              step={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              aria-invalid={touched && !!invalid}
              aria-describedby={touched && invalid ? 'ai-generator-feil' : undefined}
              className={fieldClass}
            />
          </label>
        </div>
        {touched && invalid && (
          <p id="ai-generator-feil" role="alert" className="text-small text-error">
            {invalid}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="neutral" onClick={onClose}>
            {result && result.count > 0 ? 'Lukk' : 'Avbryt'}
          </Button>
          <Button type="submit" disabled={loading || (touched && !!invalid)}>
            {loading ? <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {loading ? 'Lager oppgaver …' : 'Lag oppgaver'}
          </Button>
          <p aria-live="polite" className="text-xs text-secondary">
            {loading && 'AI-en lager og kontrollerer oppgavene. Det kan ta litt tid.'}
          </p>
        </div>
      </form>

      {error && (
        <p role="alert" className="text-small text-error">
          {error}
        </p>
      )}
      {result && (
        <div
          role={result.failed ? 'alert' : 'status'}
          className="flex flex-col gap-1 rounded-md bg-background px-3 py-2 text-small text-on-background"
        >
          {result.failed ? (
            <p className="text-error">{result.warning}</p>
          ) : (
            <>
              <p>
                {result.count > 0
                  ? `${result.count} oppgaver er lagt til i utkastet under nivåene sine. Se gjennom dem, og trykk «Lagre endringer» for å gjøre dem tilgjengelige for elevene.`
                  : 'AI-en laget ingen oppgaver denne gangen.'}
              </p>
              {result.warning && <p className="text-error">{result.warning}</p>}
            </>
          )}
          {result.message && (
            <p>
              <span className="font-medium">Fra AI-assistenten:</span> {result.message}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
