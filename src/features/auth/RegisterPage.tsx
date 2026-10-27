import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { AuthCard, TextField } from './AuthCard'
import { authErrorMessage } from './authErrors'

/** Lærere lager sin egen konto. Elevkontoer lages av læreren inne i appen. */
export function RegisterPage() {
  const { user, profile, loading, registerTeacher } = useAuth()
  const [form, setForm] = useState({ name: '', classId: '4A', email: '', password: '', teacherCode: '' })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user && profile) {
    return <Navigate to={profile.role === 'teacher' ? '/' : '/elev'} replace />
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await registerTeacher({
        name: form.name.trim(),
        classId: form.classId.trim().toUpperCase(),
        email: form.email.trim(),
        password: form.password,
        teacherCode: form.teacherCode.trim(),
      })
    } catch (err) {
      setError(authErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthCard subtitle="Lag en lærerkonto" onSubmit={handleSubmit}>
      <TextField label="Navn" autoComplete="name" value={form.name} onChange={set('name')} />
      <TextField label="Klasse" value={form.classId} onChange={set('classId')} hint="F.eks. 4A" />
      <TextField label="E-post" type="email" autoComplete="email" value={form.email} onChange={set('email')} />
      <TextField
        label="Passord"
        type="password"
        autoComplete="new-password"
        minLength={6}
        value={form.password}
        onChange={set('password')}
        hint="Minst 6 tegn"
      />
      <TextField
        label="Lærerkode"
        value={form.teacherCode}
        onChange={set('teacherCode')}
        hint="Koden skolen har fått, så bare lærere kan registrere seg"
      />

      {error && (
        <p role="alert" className="text-small text-error">
          {error}
        </p>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Lager konto …' : 'Registrer meg'}
      </Button>

      <p className="text-center text-small text-secondary">
        Har du allerede en konto?{' '}
        <Link to="/login" className="text-primary underline">
          Logg inn
        </Link>
      </p>
    </AuthCard>
  )
}
