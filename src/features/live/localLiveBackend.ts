import type { UserProfile } from '../../types/index.ts'
import type { LiveBackend } from './liveBackend.ts'
import { deliveryUpdate, newLiveSession, progressDocId, readProgressDoc, runIdOf, type LiveSession, type ProgressDoc } from './liveProgress.ts'

// Lokal variant av LiveBackend for testene og nettlesertest-siden (e2e/harness.html) – ikke brukt i appen.
// Alt lagres som JSON i en StorageLike (localStorage i nettleseren, et objekt i minnet i Node). Når en annen fane
// endrer lagringen, sier `notify()` fra til lytterne, så to faner holder seg oppdatert (som Firestore-lytting).
// Leveringer følger de samme reglene som firestore.rules: bare mens akkurat denne gjennomføringen er i gang.
// Rene funksjoner (ingen React), så de kan testes i Node. Importene har .ts-endelse.

export interface LocalStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const PREFIX = 'laerestien:lokal-okt:'
const liveKey = (classId: string) => `${PREFIX}okt:${classId}`
const progressKey = (classId: string) => `${PREFIX}framdrift:${classId}`
const studentsKey = `${PREFIX}elevkontoer`

export interface LocalLiveBackend extends LiveBackend {
  /** Kalles når lagringen er endret utenfra (f.eks. `storage`-hendelsen fra en annen fane). */
  notify(): void
}

/**
 * `students` er elevkontoene som finnes fra før (brukes bare når lagringen ikke har noen ennå). Nye kontoer lagres i
 * lagringen, og en e-post som allerede har en konto avvises – som i Firebase Authentication.
 */
export function createLocalLiveBackend(storage: LocalStorageLike, students: UserProfile[] = [], now = () => Date.now()): LocalLiveBackend {
  const listeners = new Set<() => void>()
  const read = <T>(key: string, fallback: T): T => {
    try {
      return (JSON.parse(storage.getItem(key) ?? 'null') as T) ?? fallback
    } catch {
      return fallback
    }
  }
  const write = (key: string, value: unknown) => {
    storage.setItem(key, JSON.stringify(value))
    notify()
  }
  const notify = () => listeners.forEach((listener) => listener())
  const listen = (listener: () => void) => {
    listeners.add(listener)
    listener()
    return () => void listeners.delete(listener)
  }
  const getLive = (classId: string) => read<LiveSession | null>(liveKey(classId), null)
  const getProgress = (classId: string) => read<Record<string, ProgressDoc>>(progressKey(classId), {})
  const getStudents = () => read<UserProfile[] | null>(studentsKey, null) ?? students

  return {
    notify,
    subscribeLiveSession: (classId, onChange) => listen(() => onChange(getLive(classId))),
    startLiveSession: async (classId, sessionId) => {
      write(liveKey(classId), newLiveSession(sessionId, now()))
      return true
    },
    setLiveStatus: async (classId, status) => {
      const live = getLive(classId)
      if (live) write(liveKey(classId), { ...live, status })
    },
    endLiveSession: async (classId) => {
      const live = getLive(classId)
      if (!live) return false
      write(liveKey(classId), { ...live, status: 'ended', endedAt: now() })
      return true
    },
    saveDelivery: async (classId, base, taskId, delivery) => {
      // Som firestore.rules: bare mens akkurat denne gjennomføringen er i gang.
      const live = getLive(classId)
      if (!live || live.status !== 'running' || runIdOf(live) !== base.runId) return false
      const all = getProgress(classId)
      const id = progressDocId(base.runId, base.studentId)
      const update = deliveryUpdate(base, taskId, delivery)
      all[id] = { ...update, delivered: { ...all[id]?.delivered, ...update.delivered } }
      write(progressKey(classId), all)
      return true
    },
    subscribeRunProgress: (classId, runId, onChange) =>
      listen(() =>
        onChange(
          Object.values(getProgress(classId))
            .map(readProgressDoc)
            .filter((d): d is ProgressDoc => d !== null && d.runId === runId),
        ),
      ),
    subscribeClassStudents: (classId, onChange) =>
      listen(() => onChange(getStudents().filter((s) => s.classId === classId && s.role === 'student'))),
    createStudent: async ({ name, email, classId, level }) => {
      const all = getStudents()
      if (all.some((s) => s.email?.trim().toLowerCase() === email.trim().toLowerCase())) {
        throw Object.assign(new Error('E-posten er i bruk'), { code: 'auth/email-already-in-use' })
      }
      const uid = `uid-${email.trim().toLowerCase()}`
      write(studentsKey, [...all, { uid, name, email, role: 'student', classId, ...(level && { level }) }])
    },
    updateStudentLevel: async (uid, level) => write(studentsKey, getStudents().map((s) => (s.uid === uid ? { ...s, level } : s))),
    removeStudent: async (uid) => write(studentsKey, getStudents().filter((s) => s.uid !== uid)),
    saveAnswer: async () => true,
  }
}
