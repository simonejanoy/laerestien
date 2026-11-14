import { collection, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore'
import {
  deliveryUpdate,
  newLiveSession,
  progressDocId,
  readProgressDoc,
  type DeliveredTask,
  type LiveSession,
  type LiveStatus,
  type ProgressDoc,
} from '../features/live/liveProgress'
import type { LiveBackend } from '../features/live/liveBackend'
import { db } from './firebase'
import { saveAnswer } from './results'
import { createStudent, removeStudent, subscribeClassStudents, updateStudentLevel } from './users'

// Økta som pågår i en klasse. Læreren skriver, elevene lytter.
// Lagres i Firestore under liveSessions/{classId}. Elevenes framdrift i gjennomføringen ligger under
// liveSessions/{classId}/progress/{runId}__{uid}: eleven skriver sin egen, bare læreren i klassen kan lese.

export type { LiveSession, LiveStatus } from '../features/live/liveProgress'

const liveDoc = (classId: string) => doc(db, 'liveSessions', classId)
const progressCollection = (classId: string) => collection(db, 'liveSessions', classId, 'progress')

const logError = (action: string) => (error: unknown) =>
  console.error(`Kunne ikke ${action} økta i Firestore:`, error)

export { liveClassId } from '../features/live/liveProgress'

/**
 * Starter en ny gjennomføring av økta for elevene (ny run-ID, så ingen framdrift arves fra før).
 * Gir false hvis det ikke gikk (f.eks. feil klasse eller manglende tilgang).
 */
export function startLiveSession(classId: string, sessionId: string) {
  return setDoc(liveDoc(classId), newLiveSession(sessionId))
    .then(() => true)
    .catch((error: unknown) => {
      logError('starte')(error)
      return false
    })
}

export function setLiveStatus(classId: string, status: Exclude<LiveStatus, 'ended'>) {
  return updateDoc(liveDoc(classId), { status }).catch(logError('oppdatere'))
}

/** Avslutter økta. Dokumentet beholdes med status «ended», så elevene får beskjed og resultatene står igjen. */
export function endLiveSession(classId: string) {
  return updateDoc(liveDoc(classId), { status: 'ended', endedAt: Date.now() })
    .then(() => true)
    .catch((error: unknown) => {
      logError('avslutte')(error)
      return false
    })
}

/** Lytter på økta i klassen. Returnerer en funksjon som stopper lyttingen. */
export function subscribeLiveSession(
  classId: string,
  onChange: (session: LiveSession | null) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    liveDoc(classId),
    (snapshot) => onChange(snapshot.exists() ? (snapshot.data() as LiveSession) : null),
    onError,
  )
}

/** Eleven leverer én oppgave. Slås sammen med det som er levert før i samme gjennomføring. */
export function saveDelivery(
  classId: string,
  base: Pick<ProgressDoc, 'studentId' | 'runId' | 'sessionId' | 'level' | 'total'>,
  taskId: string,
  delivery: DeliveredTask,
) {
  return setDoc(doc(progressCollection(classId), progressDocId(base.runId, base.studentId)), deliveryUpdate(base, taskId, delivery), { merge: true })
    .then(() => true)
    .catch((error: unknown) => {
      console.error('Kunne ikke lagre den leverte oppgaven:', error)
      return false
    })
}

/** Læreren lytter på framdriften til alle elevene i én gjennomføring. */
export function subscribeRunProgress(
  classId: string,
  runId: string,
  onChange: (docs: ProgressDoc[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(progressCollection(classId), where('runId', '==', runId)),
    (snapshot) => onChange(snapshot.docs.map((d) => readProgressDoc(d.data())).filter((d): d is ProgressDoc => d !== null)),
    onError,
  )
}

/** Firestore-varianten av LiveBackend – det appen bruker. */
export const firebaseLiveBackend: LiveBackend = {
  subscribeLiveSession,
  startLiveSession,
  setLiveStatus: (classId, status) => setLiveStatus(classId, status),
  endLiveSession,
  saveDelivery,
  subscribeRunProgress,
  subscribeClassStudents,
  createStudent,
  updateStudentLevel,
  removeStudent,
  saveAnswer,
}
