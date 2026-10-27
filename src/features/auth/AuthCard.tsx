import type { FormEvent, InputHTMLAttributes, ReactNode } from 'react'
import logo from '../../assets/logo/logo-bla.png'

/** Hvitt kort med logo, brukt på innlogging og registrering. */
export function AuthCard({
  subtitle,
  onSubmit,
  children,
}: {
  subtitle: string
  onSubmit: (event: FormEvent) => void
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-light p-4">
      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-5 rounded-lg bg-background p-8 shadow-sm">
        <div>
          <h1>
            <img src={logo} alt="Lærestien" className="h-[72px] w-auto" />
          </h1>
          <p className="mt-2 text-small text-secondary">{subtitle}</p>
        </div>
        {children}
      </form>
    </div>
  )
}

export function TextField({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-small text-primary">
      {label}
      <input
        required
        className="rounded border border-surface px-3 py-2 text-on-background outline-none focus:border-secondary"
        {...props}
      />
      {hint && <span className="text-xs text-secondary">{hint}</span>}
    </label>
  )
}
