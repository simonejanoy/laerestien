import { Trash2, UserPlus } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { levelStyles } from '../../components/ui/levelStyles'
import { useAuth } from '../../hooks/useAuth'
import { createStudent, removeStudent, subscribeClassStudents, updateStudentLevel } from '../../lib/users'
import type { Level, UserProfile } from '../../types'
import { authErrorMessage } from '../auth/authErrors'
import { PageBreadcrumbs } from '../../components/layout/PageBreadcrumbs'

const levels: Level[] = [1, 2, 3]
const emptyForm = { name: '', email: '', password: '' }

const inputClass =
  'w-full rounded-md border border-surface bg-background px-3 py-2 text-small text-primary outline-none focus:border-secondary'

/** Læreren lager og administrerer elevkontoene i klassen sin. */
export function ManageStudentsPage() {
  const { profile } = useAuth()
  const classId = profile?.classId ?? '4A'

  // undefined = laster
  const [students, setStudents] = useState<UserProfile[] | undefined>(undefined)
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
    [classId],
  )

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setMessage(null)
    setSubmitting(true)
    try {
      await createStudent({ ...form, name: form.name.trim(), email: form.email.trim(), classId })
      setMessage({ tone: 'ok', text: `Kontoen til ${form.name.trim()} er laget. Gi eleven e-posten og passordet.` })
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
          Lag innlogging til elevene dine. Eleven logger inn med e-posten og passordet du velger her. Alle elever
          starter på nivå 1, og du kan endre nivået i listen.
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
              return (
                <li key={student.uid} className="flex items-center gap-4 border-b border-surface bg-background px-4 py-3 last:border-b-0">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body text-primary">{student.name}</span>
                    <span className="text-small text-secondary">{student.email}</span>
                  </span>
                  <select
                    aria-label={`Nivå for ${student.name}`}
                    value={level}
                    onChange={(e) => updateStudentLevel(student.uid, Number(e.target.value) as Level).catch(fail)}
                    className={`cursor-pointer rounded-full px-3 py-1 text-small outline-none ${style.surface} ${style.text}`}
                  >
                    {levels.map((l) => (
                      <option key={l} value={l}>
                        Nivå {l}
                      </option>
                    ))}
                  </select>
                  {confirmRemove === student.uid ? (
                    <span className="flex items-center gap-2 text-small">
                      Fjerne {student.name.split(' ')[0]}?
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmRemove(null)
                          removeStudent(student.uid).catch(fail)
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
                      onClick={() => setConfirmRemove(student.uid)}
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
