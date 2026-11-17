import { createContext, useContext } from 'react'
import type { Level, UserProfile } from '../../types/index.ts'
import type { AnswerRecord } from '../repetition/answers.ts'
import type { DeliveredTask, LiveSession, LiveSnapshot, LiveStatus, ProgressDoc } from './liveProgress.ts'

type Unsubscribe = () => void

/**
 * Det lærer- og elevvisningen trenger for økta som pågår og elevkontoene i klassen. I appen er det Firestore (lib/liveSession.ts); nettleser-
 * testene bruker en lokal variant (e2e/localLiveBackend.ts), så hele flyten kan testes uten Firebase.
 */
export interface LiveBackend {
  subscribeLiveSession(classId: string, onChange: (live: LiveSession | null) => void, onError: (error: Error) => void): Unsubscribe
  /** Starter en ny gjennomføring. `snapshot` er økta slik læreren har den (navn og oppgaver), som eleven får. */
  startLiveSession(classId: string, sessionId: string, snapshot?: LiveSnapshot): Promise<boolean>
  setLiveStatus(classId: string, status: Exclude<LiveStatus, 'ended'>): Promise<unknown>
  endLiveSession(classId: string): Promise<boolean>
  saveDelivery(
    classId: string,
    base: Pick<ProgressDoc, 'studentId' | 'runId' | 'sessionId' | 'level' | 'total'>,
    taskId: string,
    delivery: DeliveredTask,
  ): Promise<boolean>
  subscribeRunProgress(classId: string, runId: string, onChange: (docs: ProgressDoc[]) => void, onError: (error: Error) => void): Unsubscribe
  subscribeClassStudents(classId: string, onChange: (students: UserProfile[]) => void, onError: (error: Error) => void): Unsubscribe
  /** Lager innlogging og elevprofil. Feiler (som Firebase) når e-posten allerede har en konto. */
  createStudent(student: { name: string; email: string; password: string; classId: string; level?: Level }): Promise<void>
  updateStudentLevel(uid: string, level: Level): Promise<void>
  removeStudent(uid: string): Promise<void>
  /** Anonymt svar til repetisjonen (se repetition/answers.ts). */
  saveAnswer(classId: string, record: AnswerRecord): Promise<unknown>
}

export const LiveBackendContext = createContext<LiveBackend | null>(null)

export function useLiveBackend() {
  const backend = useContext(LiveBackendContext)
  if (!backend) throw new Error('useLiveBackend må brukes inne i <LiveBackendContext.Provider>')
  return backend
}
