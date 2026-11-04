import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal, ModalCloseButton } from '../../components/ui/Modal'
import type { CalendarSlot, Session, Weekday } from '../../types'
import { breaks, isSameWeek, lessonSlots, timeSlots, weekdays, type WeekRef } from '../calendar/mockData'
import { terms } from '../topics/mockData'
import { useSessions, type SessionInput } from './sessionsContext'

interface SessionFormDialogProps {
  open: boolean
  /** Økta som redigeres. Mangler når en ny økt lages. */
  session?: Session
  /** Uka en ny økt legges i. En eksisterende økt blir i sin uke. */
  week?: WeekRef
  onClose: () => void
  onSave: (input: SessionInput) => void
}

const fieldClass =
  'w-full rounded-md border border-surface bg-background px-3 py-2 text-small text-on-background outline-none focus:border-secondary'
const labelClass = 'flex flex-col gap-1 text-small text-primary'

/** Timen etter `time` samme dag, hvis den ikke er et friminutt. */
function nextLesson(time: string) {
  const next = timeSlots[timeSlots.indexOf(time) + 1]
  return next && !breaks[next] ? next : undefined
}

/** Popup for å lage en ny undervisningsøkt eller endre en eksisterende. */
export function SessionFormDialog({ open, session, week, onClose, onSave }: SessionFormDialogProps) {
  const { calendarEntries } = useSessions()

  const [topicId, setTopicId] = useState(session?.topicId ?? 'addisjon-og-subtraksjon')
  const [day, setDay] = useState<Weekday>(session?.slots[0].day ?? 'Mandag')
  const [time, setTime] = useState(session?.slots[0].time ?? lessonSlots[0])
  const [double, setDouble] = useState((session?.slots.length ?? 1) > 1)
  const [heading, setHeading] = useState(session?.heading ?? '')
  const [description, setDescription] = useState(session?.description ?? '')
  const [error, setError] = useState<string | null>(null)

  const secondTime = nextLesson(time)
  const canBeDouble = secondTime !== undefined

  const at = session ?? week

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const slots: CalendarSlot[] = [{ day, time }]
    if (double && secondTime) slots.push({ day, time: secondTime })

    const taken = slots.find((slot) =>
      calendarEntries.some(
        (e) =>
          e.sessionId !== session?.id &&
          (!at || isSameWeek(e, at)) &&
          e.day === slot.day &&
          e.time === slot.time,
      ),
    )
    if (taken) {
      setError(`Det er allerede en økt ${taken.day.toLowerCase()} kl. ${taken.time}. Velg en annen tid.`)
      return
    }
    onSave({ topicId, heading: heading.trim(), description: description.trim(), slots })
  }

  const title = session ? 'Rediger økt' : 'Ny undervisningsøkt'

  return (
    <Modal open={open} onClose={onClose} labelledBy="okt-skjema-tittel" className="gap-5">
      <div className="flex items-start justify-between">
        <h2 id="okt-skjema-tittel" className="text-h2 text-on-background">
          {title}
        </h2>
        <ModalCloseButton onClick={onClose} />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className={labelClass}>
          Tema
          <select
            value={topicId}
            disabled={Boolean(session)}
            onChange={(e) => setTopicId(e.target.value)}
            className={`${fieldClass} cursor-pointer disabled:cursor-not-allowed disabled:bg-surface-light`}
          >
            {terms.map((term) => (
              <optgroup key={term.id} label={term.name}>
                {term.topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {session && <span className="text-xs text-secondary">Temaet kan ikke endres på en eksisterende økt.</span>}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Dag
            <select value={day} onChange={(e) => setDay(e.target.value as Weekday)} className={`${fieldClass} cursor-pointer`}>
              {weekdays.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Starttid
            <select value={time} onChange={(e) => setTime(e.target.value)} className={`${fieldClass} cursor-pointer`}>
              {lessonSlots.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className="pb-1 text-small text-primary">Lengde</legend>
          <div className="flex gap-4 text-small text-on-background">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="lengde" checked={!double} onChange={() => setDouble(false)} className="size-4 accent-primary" />
              Enkeltøkt
            </label>
            <label className={`flex items-center gap-2 ${canBeDouble ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
              <input
                type="radio"
                name="lengde"
                checked={double && canBeDouble}
                disabled={!canBeDouble}
                onChange={() => setDouble(true)}
                className="size-4 accent-primary"
              />
              Dobbeltøkt{secondTime ? ` (til og med ${secondTime}-timen)` : ''}
            </label>
          </div>
          {!canBeDouble && <span className="text-xs text-secondary">Det er friminutt eller dagen slutter etter denne timen.</span>}
        </fieldset>

        <label className={labelClass}>
          Overskrift
          <input
            required
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            placeholder="F.eks. Addisjon med tierovergang – øve og bruke"
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          Beskrivelse (valgfritt)
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${fieldClass} resize-y`}
          />
        </label>

        {error && (
          <p role="alert" className="text-small text-error">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="neutral" size="lg" onClick={onClose}>
            Avbryt
          </Button>
          <Button type="submit" size="lg">
            {session ? 'Lagre endringer' : 'Opprett økt'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
