// Testside for Playwright (bare dev-serveren leverer den, og den er ikke med i bygget). Viser grunnoppgavene i en økt med
// de samme komponentene som appen: elevvisningen (StudentTaskFlow) og lærerens forhåndsvisning (StudentPreviewDialog) –
// uten innlogging og uten Firebase. URL: /e2e/harness.html?okt=regning-2&niva=3&visning=elev|forhandsvisning&oppgave=0
// Med visning=okt vises økta som pågår (lærer eller elev, se liveHarness.tsx). Med visning=statistikk vises elevkortene
// på statistikksiden (StudentCarousel). Med visning=meny vises lærersidenes oppsett med sidemenyen (AppLayout).
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import { buildTasks, evenLevels, mergeTasks, planned } from '../src/features/sessions/sessionTasks'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks'
import { StudentTaskFlow } from '../src/features/student/StudentTaskFlow'
import { StudentPreviewDialog } from '../src/features/tasks/StudentPreviewDialog'
import { LiveHarness } from './liveHarness'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AppLayout } from '../src/components/layout/AppLayout'
import { AuthContext } from '../src/context/auth'
import { students } from '../src/features/class/students'
import { StudentCarousel } from '../src/features/statistics/StudentCarousel'
import type { Level, Session } from '../src/types'

const params = new URLSearchParams(location.search)
const sessionId = params.get('okt') ?? 'regning-2'
const level = Number(params.get('niva') ?? 1) as Level
const view = params.get('visning') ?? 'elev'
const start = Number(params.get('oppgave') ?? 0)

const unitId = sessionId.replace(/-\d+$/, '')
const plan = view === 'okt' || view === 'statistikk' || view === 'meny' ? undefined : planned(unitId).find((s) => s.id === sessionId)!
const tasks = plan ? evenLevels(mergeTasks(worksheetTasks[sessionId] ?? [], buildTasks(plan))).filter((t) => t.level === level) : []
const session = { id: sessionId, topicId: unitId, title: plan?.spec.title, numbers: [(plan?.n ?? 0) + 1] } as unknown as Session

function Harness() {
  const [index, setIndex] = useState(start)
  if (view === 'meny') {
    // Lærersidenes oppsett med sidemenyen (e2e/sidebar.spec.ts), uten innlogging og uten Firebase.
    const teacher = { uid: 'uid-laerer', name: 'Testlærer', role: 'teacher' as const, title: 'Kontaktlærer', classId: '4A' }
    const auth = { user: { uid: teacher.uid } as User, profile: teacher, loading: false, login: async () => {}, registerTeacher: async () => {}, logout: async () => {} }
    return (
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<h1>Hjem-siden</h1>} />
              <Route path="statistikk" element={<h1>Statistikk-siden</h1>} />
              <Route path="tema" element={<h1>Tema-siden</h1>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    )
  }
  if (view === 'statistikk') {
    return (
      <MemoryRouter>
        <div className="p-4 sm:p-8">
          <StudentCarousel students={students} />
          <p data-testid="under">Innhold under elevkortene</p>
        </div>
      </MemoryRouter>
    )
  }
  if (view === 'okt') return <LiveHarness role={params.get('rolle') === 'laerer' ? 'laerer' : params.get('rolle') === 'okt-side' ? 'okt-side' : 'elev'} sessionId={sessionId} />
  if (view === 'forhandsvisning') return <StudentPreviewDialog session={session} level={level} tasks={tasks.slice(start)} onClose={() => {}} />
  return <StudentTaskFlow tasks={tasks} index={index} onNext={() => setIndex(index + 1)} topicId={session.topicId} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
