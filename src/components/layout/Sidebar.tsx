import {
  ChartNoAxesCombined,
  ChevronDown,
  House,
  ListOrdered,
  LogOut,
  UserRoundGroup,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import logo from '../../assets/logo/logo-hvit.png'
import { useAuth } from '../../hooks/useAuth'
import { Avatar } from '../ui/Avatar'

const navItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Hjem', icon: House },
  { to: '/statistikk', label: 'Statistikk', icon: ChartNoAxesCombined },
  { to: '/tema', label: 'Alle tema', icon: ListOrdered },
  { to: '/elever', label: 'Elever', icon: Users },
]

// Bare 4A har data foreløpig – de andre klassene vises som inaktive, som i Figma.
const activeClass = '4A'
const otherClasses = ['4B', '4C']

const classButton = 'flex h-[46px] w-[185px] items-center gap-4 rounded-[7px] bg-tertiary pr-[7px] pl-2 text-body text-on-tertiary'

export function Sidebar() {
  const { profile, logout } = useAuth()
  const [classesOpen, setClassesOpen] = useState(false)

  return (
    <aside className="sticky top-0 flex h-screen w-[251px] shrink-0 flex-col items-center gap-[38px] bg-sidebar px-8 pt-10 pb-8">
      <div className="flex w-[185px] items-center gap-3">
        <Avatar name={profile?.name ?? ''} />
        <div className="min-w-0">
          <p className="truncate text-body text-on-primary">{profile?.name}</p>
          <p className="text-small text-on-background">{profile?.title}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-expanded={classesOpen}
          aria-controls="klassevelger"
          onClick={() => setClassesOpen((open) => !open)}
          className={`${classButton} cursor-pointer`}
        >
          <UserRoundGroup className="size-6" />
          <span className="flex-1 text-left">Klasse {activeClass}</span>
          <ChevronDown className={`size-6 transition-transform ${classesOpen ? 'rotate-180' : ''}`} />
        </button>
        {classesOpen && (
          <ul id="klassevelger" className="flex flex-col gap-2">
            {otherClasses.map((name) => (
              <li key={name}>
                <button type="button" disabled title="Kommer senere" className={`${classButton} opacity-50`}>
                  <UserRoundGroup className="size-6" />
                  Klasse {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <nav className="flex flex-col gap-12">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex h-[46px] w-[185px] items-center gap-[15px] rounded-[7px] px-2.5 text-body text-on-background transition-colors ${
                isActive ? 'bg-surface' : 'bg-tertiary hover:bg-surface'
              }`
            }
          >
            <Icon className="size-6" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="flex w-full flex-1 flex-col items-center justify-end gap-6">
        <button
          type="button"
          onClick={logout}
          className="flex cursor-pointer items-center gap-2 text-small text-on-primary hover:underline"
        >
          <LogOut className="size-4" />
          Logg ut
        </button>
        <img src={logo} alt="Lærestien" className="aspect-[3/1] w-full object-contain" />
      </div>
    </aside>
  )
}
