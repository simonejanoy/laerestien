// Testside for Playwright (bare dev-serveren leverer den, og den er ikke med i bygget). Viser grunnoppgavene i en økt med
// de samme komponentene som appen: elevvisningen (StudentTaskFlow) og lærerens forhåndsvisning (StudentPreviewDialog) –
// uten innlogging og uten Firebase. URL: /e2e/harness.html?okt=regning-2&niva=3&visning=elev|forhandsvisning&oppgave=0
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import { buildTasks, planned } from '../src/features/sessions/sessionTasks'
import { worksheetTasks } from '../src/features/sessions/worksheetTasks'
import { StudentTaskFlow } from '../src/features/student/StudentTaskFlow'
import { StudentPreviewDialog } from '../src/features/tasks/StudentPreviewDialog'
import type { Level, Session } from '../src/types'

const params = new URLSearchParams(location.search)
const sessionId = params.get('okt') ?? 'regning-2'
const level = Number(params.get('niva') ?? 1) as Level
const view = params.get('visning') ?? 'elev'
const start = Number(params.get('oppgave') ?? 0)

const unitId = sessionId.replace(/-\d+$/, '')
const plan = planned(unitId).find((s) => s.id === sessionId)!
const tasks = [...(worksheetTasks[sessionId] ?? []), ...buildTasks(plan)].filter((t) => t.level === level)
const session = { id: sessionId, topicId: unitId, title: plan.spec.title, numbers: [plan.n + 1] } as unknown as Session

function Harness() {
  const [index, setIndex] = useState(start)
  if (view === 'forhandsvisning') return <StudentPreviewDialog session={session} level={level} tasks={tasks.slice(start)} onClose={() => {}} />
  return <StudentTaskFlow tasks={tasks} index={index} onNext={() => setIndex(index + 1)} topicId={session.topicId} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
