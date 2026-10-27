import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

/** Felles oppsett for lærersidene: sidemeny til venstre, innhold til høyre. */
export function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 px-[49px] pt-12 pb-14">
        <Outlet />
      </main>
    </div>
  )
}
