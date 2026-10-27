import {
  ChartNoAxesCombined,
  ChevronDown,
  House,
  ListOrdered,
  LogOut,
  UserRoundGroup,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import logo from '../../assets/logo/logo-hvit.png'
import { useAuth } from '../../hooks/useAuth'
import { Avatar } from '../ui/Avatar'

/** `match` gir hvilke stier som hører til menyvalget, så undersider også markerer riktig valg. */
const navItems: { to: string; label: string; icon: LucideIcon; match: (path: string) => boolean }[] = [
  { to: '/', label: 'Hjem', icon: House, match: (p) => p === '/' },
  { to: '/statistikk', label: 'Statistikk', icon: ChartNoAxesCombined, match: (p) => p.startsWith('/statistikk') },
  { to: '/tema', label: 'Alle tema', icon: ListOrdered, match: (p) => p.startsWith('/tema') || p.startsWith('/okt') },
  { to: '/elever', label: 'Elever', icon: Users, match: (p) => p.startsWith('/elever') },
]

// Bare 4A har data foreløpig – de andre klassene vises som inaktive, som i Figma.
const activeClass = '4A'
const otherClasses = ['4B', '4C']

const classButton = 'flex h-11 w-full items-center gap-3 rounded-[7px] bg-tertiary px-2 text-body text-on-tertiary'

interface SidebarProps {
  /** Om menyen er åpen på små skjermer (under 1024 px). Fra 1024 px vises den alltid. */
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { profile, logout } = useAuth()
  const [classesOpen, setClassesOpen] = useState(false)
  const { pathname } = useLocation()

  // Escape lukker menyen på små skjermer.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    // Låst til venstre kant med egen rulling, så menyen aldri flytter seg når siden rulles.
    // Under 1024 px skyves den inn fra venstre når den åpnes.
    <aside
      id="sidemeny"
      aria-label="Hovedmeny"
      className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col gap-6 overflow-y-auto bg-sidebar px-6 pt-8 pb-6 transition-transform lg:visible lg:translate-x-0 ${
        open ? 'visible translate-x-0' : 'invisible -translate-x-full'
      }`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Lukk meny"
        className="absolute top-3 right-3 flex size-10 cursor-pointer items-center justify-center rounded-md text-on-sidebar hover:bg-on-sidebar/15 focus-visible:outline-2 focus-visible:outline-on-sidebar lg:hidden"
      >
        <X className="size-6" />
      </button>

      <div className="flex items-center gap-3">
        <Avatar name={profile?.name ?? ''} />
        <div className="flex min-w-0 flex-col items-start">
          <p className="max-w-full truncate text-body text-on-primary">{profile?.name}</p>
          {/* Lærere uten (eller med gammel) tittel vises som kontaktlærer. */}
          <p className="text-small text-on-sidebar">
            {profile?.role === 'teacher' && (!profile.title || profile.title === 'Lærer') ? 'Kontaktlærer' : profile?.title}
          </p>
          <button
            type="button"
            onClick={logout}
            className="mt-2 flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-on-sidebar px-3 text-small text-on-sidebar transition-colors hover:bg-on-sidebar/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-sidebar"
          >
            <LogOut className="size-4" aria-hidden />
            Logg ut
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-expanded={classesOpen}
          aria-controls="klassevelger"
          onClick={() => setClassesOpen((o) => !o)}
          className={`${classButton} cursor-pointer`}
        >
          <UserRoundGroup className="size-6" aria-hidden />
          <span className="flex-1 text-left">Klasse {activeClass}</span>
          <ChevronDown className={`size-6 transition-transform ${classesOpen ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {classesOpen && (
          <ul id="klassevelger" className="flex flex-col gap-2">
            {otherClasses.map((name) => (
              <li key={name}>
                <button type="button" disabled title="Kommer senere" className={`${classButton} opacity-50`}>
                  <UserRoundGroup className="size-6" aria-hidden />
                  Klasse {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <nav className="flex flex-col gap-3">
        {navItems.map(({ to, label, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              aria-current={active ? 'page' : undefined}
              className={`flex h-11 items-center gap-3.5 rounded-[7px] px-2.5 text-body transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-sidebar ${
                active
                  ? 'bg-primary font-semibold text-on-primary shadow-[inset_4px_0_0_var(--color-on-sidebar)]'
                  : 'bg-tertiary text-on-background hover:bg-surface'
              }`}
            >
              <Icon className="size-6" aria-hidden />
              {label}
            </Link>
          )
        })}
      </nav>

      <img src={logo} alt="Lærestien" className="mt-auto aspect-[3/1] w-full object-contain pt-4" />
    </aside>
  )
}
