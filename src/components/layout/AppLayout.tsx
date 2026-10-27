import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import logo from '../../assets/logo/logo-hvit.png'
import { Sidebar } from './Sidebar'

/**
 * Felles oppsett for lærersidene.
 * Fra 1024 px: fast sidemeny til venstre. Under: toppstripe med meny-knapp som åpner sidemenyen.
 */
export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-sidebar px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Åpne meny"
          aria-expanded={menuOpen}
          aria-controls="sidemeny"
          className="flex size-10 cursor-pointer items-center justify-center rounded-md text-on-sidebar hover:bg-on-sidebar/15 focus-visible:outline-2 focus-visible:outline-on-sidebar"
        >
          <Menu className="size-6" />
        </button>
        <img src={logo} alt="Lærestien" className="h-9 w-auto" />
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-35 bg-primary/40 lg:hidden" aria-hidden onClick={() => setMenuOpen(false)} />
      )}
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <main className="min-w-0 px-4 pt-6 pb-12 sm:px-8 lg:pt-10 lg:pr-12 lg:pl-72">
        <Outlet />
      </main>
    </div>
  )
}
