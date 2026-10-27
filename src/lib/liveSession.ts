import { deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'

// Økta som pågår i en klasse. Læreren skriver, elevene lytter.
// Lagres i Firestore under liveSessions/{classId}.

export type LiveStatus = 'running' | 'paused'

export interface LiveSession {
  sessionId: string
  status: LiveStatus
  /** Millisekunder siden 1970. */
  startedAt: number
}

const liveDoc = (classId: string) => doc(db, 'liveSessions', classId)

const logError = (action: string) => (error: unknown) =>
  console.error(`Kunne ikke ${action} økta i Firestore:`, error)

export function startLiveSession(classId: string, sessionId: string) {
  const data: LiveSession = { sessionId, status: 'running', startedAt: Date.now() }
  return setDoc(liveDoc(classId), data).catch(logError('starte'))
}

export function setLiveStatus(classId: string, status: LiveStatus) {
  return updateDoc(liveDoc(classId), { status }).catch(logError('oppdatere'))
}

export function endLiveSession(classId: string) {
  return deleteDoc(liveDoc(classId)).catch(logError('avslutte'))
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
