// Testside for økta som pågår: de ekte sidene «Følg elevenes arbeid» (læreren) og elevvisningen (Nora), med en lokal
// backend i stedet for Firebase. To faner i samme nettleser deler localStorage, og `storage`-hendelsen holder dem
// oppdatert – slik Firestore-lyttingen gjør i appen. Brukes bare av Playwright (e2e/liveSession.spec.ts).
// URL: /e2e/harness.html?visning=okt&rolle=laerer|elev|okt-side&okt=okt-1-2[&side=elever|rediger][&kontoer=ingen]
// rolle=okt-side: lærerens side for økta (SessionPage) i stedet for «Følg elevenes arbeid».
// side=rediger: lærerens «Rediger oppgaver» for økta (med popupen «Legg til oppgaver»).
// kontoer=ingen: testeleven har ingen konto ennå (læreren lager den under «Elever»).
import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../src/context/auth'
import { LiveBackendContext } from '../src/features/live/liveBackend'
import { LiveSessionPage } from '../src/features/live/LiveSessionPage'
import { createLocalLiveBackend } from '../src/features/live/localLiveBackend'
import { sessionDisplayName } from '../src/features/live/liveSnapshot'
import { studentLevel } from '../src/features/live/liveProgress'
import { roster } from '../src/features/class/roster'
import { ManageStudentsPage } from '../src/features/class/ManageStudentsPage'
import { SessionPage } from '../src/features/sessions/SessionPage'
import { SessionsProvider } from '../src/features/sessions/SessionsProvider'
import { useSessions } from '../src/features/sessions/sessionsContext'
import { StudentHomePage } from '../src/features/student/StudentHomePage'
import { EditTasksPage } from '../src/features/tasks/EditTasksPage'
import { answerOf } from '../src/features/tasks/taskUtils'
import type { UserProfile } from '../src/types'

// Fiktive kontoer. Nora har ikke nivå på kontoen, så hun får nivået i klasselista (nivå 3). Profilen heter «Nora Teigen»
// som i Firebase, men læreren ser henne som «Nora L.» (kobles på e-post).
const nora: UserProfile = { uid: 'uid-nora', name: 'Nora Teigen', email: 'nora@teigen.no', role: 'student', classId: '4A' }
const teacher: UserProfile = { uid: 'uid-laerer', name: 'Testlærer', role: 'teacher', title: 'Kontaktlærer', classId: '4A' }

const params = new URLSearchParams(location.search)
const backend = createLocalLiveBackend(window.localStorage, params.get('kontoer') === 'ingen' ? [] : [nora])
window.addEventListener('storage', () => backend.notify())

/** Fasiten til Noras oppgaver, i rekkefølgen hun får dem – så testen kan svare riktig. Og antall oppgaver per nivå i hver økt. */
function ExposeAnswers({ sessionId }: { sessionId: string }) {
  const { sessions, getTasks } = useSessions()
  const level = studentLevel(nora, roster)
  const session = sessions.find((s) => s.id === sessionId)
  const sessionName = session ? sessionDisplayName(session) : ''
  const answers = getTasks(sessionId)
    .filter((t) => t.level === level)
    .map((t) => (t.kind === 'text' ? null : answerOf(t)))
  const levelCounts = Object.fromEntries(sessions.map((s) => [s.id, [1, 2, 3].map((l) => getTasks(s.id).filter((t) => t.level === l).length)]))
  useEffect(() => {
    Object.assign(window, { studentAnswers: answers, levelCounts, sessionName })
  })
  return null
}

export function LiveHarness({ role, sessionId }: { role: 'laerer' | 'elev' | 'okt-side'; sessionId: string }) {
  const side = params.get('side')
  const start =
    role === 'elev'
      ? '/elev'
      : side === 'elever'
        ? '/elever'
        : side === 'rediger'
          ? `/okt/${sessionId}/rediger`
          : role === 'okt-side'
            ? `/okt/${sessionId}`
            : `/okt/${sessionId}/live`
  // Eleven logger inn med Nora-kontoen som finnes i lagringen (den læreren lagde under «Elever», eller den fra før).
  const [account, setAccount] = useState<UserProfile | null>(null)
  useEffect(() => backend.subscribeClassStudents('4A', (list) => setAccount(list.find((s) => s.email === nora.email) ?? null), () => {}), [])
  const profile = role === 'elev' ? account : teacher
  if (!profile) return <p className="p-8">Ingen konto for {nora.email}.</p>
  const auth = { user: { uid: profile.uid } as User, profile, loading: false, login: async () => {}, registerTeacher: async () => {}, logout: async () => {} }
  return (
    <AuthContext.Provider value={auth}>
      <LiveBackendContext.Provider value={backend}>
        <SessionsProvider>
          <ExposeAnswers sessionId={sessionId} />
          <MemoryRouter initialEntries={[start]}>
            <Routes>
              <Route path="/okt/:sessionId/live" element={<div className="p-8"><LiveSessionPage /></div>} />
              <Route path="/okt/:sessionId/rediger" element={<div className="p-8"><EditTasksPage /></div>} />
              <Route path="/okt/:sessionId" element={<div className="p-8"><SessionPage /></div>} />
              <Route path="/elev" element={<StudentHomePage />} />
              <Route path="/elever" element={<div className="p-8"><ManageStudentsPage /></div>} />
            </Routes>
          </MemoryRouter>
        </SessionsProvider>
      </LiveBackendContext.Provider>
    </AuthContext.Provider>
  )
}
