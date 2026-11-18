import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

/**
 * Felles oppsett for lærersidene.
 * Fra 1024 px: sidemenyen står alltid åpen til venstre. Under: en smal stripe med ikoner for de samme sidene.
 */
export function AppLayout() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="min-w-0 pt-6 pr-4 pb-12 pl-20 sm:pr-8 sm:pl-24 lg:pt-10 lg:pr-12 lg:pl-72">
        <Outlet />
      </main>
    </div>
  )
}
