import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import type { Role } from '../../types'

const homeFor: Record<Role, string> = { teacher: '/', student: '/elev' }

/** Slipper bare inn innloggede brukere med riktig rolle. */
export function ProtectedRoute({ role, children }: { role: Role; children: ReactNode }) {
  const { user, profile, loading } = useAuth()

  if (loading) return <FullPageMessage text="Laster …" />
  if (!user) return <Navigate to="/login" replace />
  if (!profile) {
    return <FullPageMessage text="Fant ingen brukerprofil for denne kontoen. Kontakt læreren din." />
  }
  if (profile.role !== role) return <Navigate to={homeFor[profile.role]} replace />

  return children
}

export function FullPageMessage({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-8 text-small text-secondary">
      {text}
    </div>
  )
}
