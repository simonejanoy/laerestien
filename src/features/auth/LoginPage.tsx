import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { AuthCard, TextField } from './AuthCard'
import { authErrorMessage } from './authErrors'

export function LoginPage() {
  const { user, profile, profileError, loading, login, logout } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Allerede innlogget (f.eks. fra forrige besøk): send rett videre.
  if (!loading && user && profile) {
    return <Navigate to={profile.role === 'teacher' ? '/' : '/elev'} replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthCard subtitle="Logg inn med e-post og passord" onSubmit={handleSubmit}>
      <TextField label="E-post" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <TextField
        label="Passord"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error && (
        <p role="alert" className="text-small text-error">
          {error}
        </p>
      )}
      {/* Innloggingen gikk, men profilen i Firestore mangler eller er ufullstendig. */}
      {!error && !loading && user && profileError && (
        <div role="alert" className="flex flex-col gap-2 text-small text-error">
          <p>{profileError}</p>
          <button type="button" onClick={() => void logout()} className="cursor-pointer self-start text-primary underline">
            Logg ut og prøv en annen konto
          </button>
        </div>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Logger inn …' : 'Logg inn'}
      </Button>

      <p className="text-center text-small text-secondary">
        Ny lærer?{' '}
        <Link to="/registrer" className="text-primary underline">
          Registrer deg
        </Link>
      </p>
    </AuthCard>
  )
}
