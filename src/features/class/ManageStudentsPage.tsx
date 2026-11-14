import { Trash2, UserPlus } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { levelStyles } from '../../components/ui/levelStyles'
import { useAuth } from '../../hooks/useAuth'
import type { Level, UserProfile } from '../../types'
import { useLiveBackend } from '../live/liveBackend'
import { buildRoster, checkNewStudent } from '../live/liveProgress'
import { students as classList } from './students'
import { authErrorMessage } from '../auth/authErrors'
import { PageBreadcrumbs } from '../../components/layout/PageBreadcrumbs'

const levels: Level[] = [1, 2, 3]
const emptyForm = { name: '', email: '', password: '' }

const inputClass =
  'w-full rounded-md border border-surface bg-background px-3 py-2 text-small text-primary outline-none focus:border-secondary'

/**
 * Læreren lager og administrerer elevkontoene i klassen sin. Lista er klasselista koblet til kontoene: en ny konto med
 * samme e-post (eller samme navn, når e-posten mangler) som en elev i lista, kobles til den eleven – det blir aldri to.
 */
export function ManageStudentsPage() {
  const { profile } = useAuth()
  const { createStudent, removeStudent, subscribeClassStudents, updateStudentLevel } = useLiveBackend()
  const classId = profile?.classId ?? '4A'

  // undefined = laster
  const [accounts, setStudents] = useState<UserProfile[] | undefined>(undefined)
  const [loadError, setLoadError] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  useEffect(
    () =>
      subscribeClassStudents(
        classId,
        (list) => {
          setLoadError(false)
          setStudents(list)
        },
        () => setLoadError(true),
      ),
    [classId, subscribeClassStudents],
  )
  const students = accounts && buildRoster(classList, accounts)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setMessage(null)
    if (!students) return
    const name = form.name.trim()
    const email = form.email.trim()
    // Ingen doble elever: samme e-post gir aldri to kontoer, og en elev i klasselista får bare én konto.
    const check = checkNewStudent(students, { name, email })
    if ('error' in check) {
      setMessage({ tone: 'error', text: check.error })
      return
    }
    setSubmitting(true)
    try {
      await createStudent({ name, email, password: form.password, classId, ...(check.match && { level: check.match.level }) })
      setMessage({
        tone: 'ok',
        text: check.match
          ? `Kontoen er laget og koblet til ${check.match.name} i klasselista (nivå ${check.match.level}). Gi eleven e-posten og passordet.`
          : `Kontoen til ${name} er laget. Gi eleven e-posten og passordet.`,
      })
      setForm(emptyForm)
    } catch (error) {
      setMessage({ tone: 'error', text: authErrorMessage(error) })
    } finally {
      setSubmitting(false)
    }
  }

  const fail = (error: unknown) => setMessage({ tone: 'error', text: authErrorMessage(error) })

  return (
    <div className="flex max-w-[1109px] flex-col gap-8">
      <div className="flex flex-col gap-2">
        <PageBreadcrumbs inClass />
        <h1 className="text-h1 text-on-background">Elever i klasse {classId}</h1>
        <p className="text-small text-secondary">
          Lag innlogging til elevene dine. Eleven logger inn med e-posten og passordet du velger her. En elev som står i
          klasselista, beholder nivået sitt; nye elever starter på nivå 1. Du kan endre nivået i listen.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg bg-surface-light p-5">
        <h2 className="flex items-center gap-2.5 text-h3 text-primary">
          <UserPlus className="size-6" />
          Ny elev
        </h2>
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[2fr_2fr_1.5fr]">
          <label className="flex flex-col gap-1 text-xs text-secondary">
            Navn
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-secondary">
            E-post
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-secondary">
            Passord (minst 6 tegn)
            <input
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={inputClass}
            />
          </label>
        </div>
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Lager konto …' : 'Lag elevkonto'}
          </Button>
          {message && (
            <p role={message.tone === 'error' ? 'alert' : 'status'} className={`text-small ${message.tone === 'error' ? 'text-error' : 'text-on-surface'}`}>
              {message.text}
            </p>
          )}
        </div>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 text-primary">Elever ({students?.length ?? 0})</h2>
        {loadError ? (
          <p className="text-small text-error">
            Fikk ikke hentet elevene. Sjekk at Firestore og sikkerhetsreglene er satt opp.
          </p>
        ) : students === undefined ? (
          <p className="text-small text-secondary">Henter elever …</p>
        ) : students.length === 0 ? (
          <p className="rounded-lg border border-dashed border-surface p-8 text-center text-small text-secondary">
            Ingen elever ennå. Lag den første kontoen over.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-surface">
            {students.map((student) => {
              const level = student.level ?? 1
              const style = levelStyles[level]
              const uid = student.uid
              return (
                <li key={student.id} data-student={student.name} className="flex items-center gap-4 border-b border-surface bg-background px-4 py-3 last:border-b-0">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body text-primary">{student.name}</span>
                    <span className="text-small text-secondary">
                      {uid ? student.email : 'Ingen konto ennå'}
                      {student.duplicateOf && (
                        <span className="ml-2 text-error">Mulig dobbel av {student.duplicateOf} – fjern kontoen hvis den er laget ved en feil.</span>
                      )}
                    </span>
                  </span>
                  {!uid && (
                    <button
                      type="button"
                      onClick={() => setForm({ name: student.name, email: student.email ?? '', password: '' })}
                      className="cursor-pointer text-small text-primary underline"
                    >
                      Lag konto
                    </button>
                  )}
                  <select
                    aria-label={`Nivå for ${student.name}`}
                    value={level}
                    disabled={!uid}
                    onChange={(e) => uid && updateStudentLevel(uid, Number(e.target.value) as Level).catch(fail)}
                    className={`cursor-pointer rounded-full px-3 py-1 text-small outline-none disabled:cursor-default disabled:opacity-70 ${style.surface} ${style.text}`}
                  >
                    {levels.map((l) => (
                      <option key={l} value={l}>
                        Nivå {l}
                      </option>
                    ))}
                  </select>
                  {!uid ? null : confirmRemove === uid ? (
                    <span className="flex items-center gap-2 text-small">
                      Fjerne {student.name.split(' ')[0]}?
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmRemove(null)
                          removeStudent(uid).catch(fail)
                        }}
                        className="cursor-pointer rounded bg-error px-2.5 py-1 text-on-error"
                      >
                        Fjern
                      </button>
                      <button type="button" onClick={() => setConfirmRemove(null)} className="cursor-pointer text-secondary underline">
                        Avbryt
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Fjern ${student.name}`}
                      onClick={() => setConfirmRemove(uid)}
                      className="cursor-pointer text-secondary hover:text-error"
                    >
                      <Trash2 className="size-5" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
