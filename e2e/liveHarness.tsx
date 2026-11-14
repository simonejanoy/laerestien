// Testside for økta som pågår: de ekte sidene «Følg elevenes arbeid» (læreren) og elevvisningen (Amalie), med en lokal
// backend i stedet for Firebase. To faner i samme nettleser deler localStorage, og `storage`-hendelsen holder dem
// oppdatert – slik Firestore-lyttingen gjør i appen. Brukes bare av Playwright (e2e/liveSession.spec.ts).
// URL: /e2e/harness.html?visning=okt&rolle=laerer|elev&okt=okt-1-2[&side=elever][&kontoer=ingen]
// kontoer=ingen: Amalie har ingen konto ennå (læreren lager den under «Elever»).
import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../src/context/auth'
import { LiveBackendContext } from '../src/features/live/liveBackend'
import { LiveSessionPage } from '../src/features/live/LiveSessionPage'
import { createLocalLiveBackend } from '../src/features/live/localLiveBackend'
import { studentLevel } from '../src/features/live/liveProgress'
import { roster } from '../src/features/class/roster'
import { ManageStudentsPage } from '../src/features/class/ManageStudentsPage'
import { SessionsProvider } from '../src/features/sessions/SessionsProvider'
import { useSessions } from '../src/features/sessions/sessionsContext'
import { StudentHomePage } from '../src/features/student/StudentHomePage'
import { answerOf } from '../src/features/tasks/taskUtils'
import type { UserProfile } from '../src/types'

// Fiktive kontoer. Amalie har ikke nivå på kontoen, så hun får nivået i klasselista (nivå 1).
const amalie: UserProfile = { uid: 'uid-amalie', name: 'Amalie Berg', email: 'amalie@teigen.no', role: 'student', classId: '4A' }
const teacher: UserProfile = { uid: 'uid-laerer', name: 'Testlærer', role: 'teacher', title: 'Kontaktlærer', classId: '4A' }

const params = new URLSearchParams(location.search)
const backend = createLocalLiveBackend(window.localStorage, params.get('kontoer') === 'ingen' ? [] : [amalie])
window.addEventListener('storage', () => backend.notify())

/** Fasiten til Amalies oppgaver, i rekkefølgen hun får dem – så testen kan svare riktig. */
function ExposeAnswers({ sessionId }: { sessionId: string }) {
  const { getTasks } = useSessions()
  const level = studentLevel(amalie, roster)
  const answers = getTasks(sessionId)
    .filter((t) => t.level === level)
    .map((t) => (t.kind === 'text' ? null : answerOf(t)))
  useEffect(() => {
    ;(window as unknown as { amalieAnswers: (number | null)[] }).amalieAnswers = answers
  })
  return null
}

export function LiveHarness({ role, sessionId }: { role: 'laerer' | 'elev'; sessionId: string }) {
  const start = role === 'elev' ? '/elev' : params.get('side') === 'elever' ? '/elever' : `/okt/${sessionId}/live`
  // Eleven logger inn med Amalie-kontoen som finnes i lagringen (den læreren lagde under «Elever», eller den fra før).
  const [account, setAccount] = useState<UserProfile | null>(null)
  useEffect(() => backend.subscribeClassStudents('4A', (list) => setAccount(list.find((s) => s.email === amalie.email) ?? null), () => {}), [])
  const profile = role === 'laerer' ? teacher : account
  if (!profile) return <p className="p-8">Ingen konto for {amalie.email}.</p>
  const auth = { user: { uid: profile.uid } as User, profile, loading: false, login: async () => {}, registerTeacher: async () => {}, logout: async () => {} }
  return (
    <AuthContext.Provider value={auth}>
      <LiveBackendContext.Provider value={backend}>
        <SessionsProvider>
          <ExposeAnswers sessionId={sessionId} />
          <MemoryRouter initialEntries={[start]}>
            <Routes>
              <Route path="/okt/:sessionId/live" element={<div className="p-8"><LiveSessionPage /></div>} />
              <Route path="/okt/:sessionId" element={<p>Økten</p>} />
              <Route path="/elev" element={<StudentHomePage />} />
              <Route path="/elever" element={<div className="p-8"><ManageStudentsPage /></div>} />
            </Routes>
          </MemoryRouter>
        </SessionsProvider>
      </LiveBackendContext.Provider>
    </AuthContext.Provider>
  )
}
