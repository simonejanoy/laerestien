import { collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore'
import type { Level, UserProfile } from '../types'
import { createAccount, db } from './firebase'

// Elevkontoer i Firestore (users/{uid}). Bare læreren i klassen kan endre dem.

export interface NewStudent {
  name: string
  email: string
  password: string
  classId: string
  /** Nivået eleven står på i klasselista. Uten nivå starter eleven på nivå 1. */
  level?: Level
}

/** Lytter på elevene i en klasse, sortert på navn. */
export function subscribeClassStudents(
  classId: string,
  onChange: (students: UserProfile[]) => void,
  onError: (error: Error) => void,
) {
  const q = query(collection(db, 'users'), where('classId', '==', classId), where('role', '==', 'student'))
  return onSnapshot(
    q,
    (snapshot) =>
      onChange(
        snapshot.docs
          .map((d) => ({ uid: d.id, ...d.data() }) as UserProfile)
          .sort((a, b) => a.name.localeCompare(b.name, 'nb')),
      ),
    onError,
  )
}

/** Lager innloggingen og elevprofilen. Med nivå fra klasselista får eleven det; ellers starter eleven på nivå 1. */
export async function createStudent({ name, email, password, classId, level }: NewStudent) {
  const uid = await createAccount(email, password)
  await setDoc(doc(db, 'users', uid), { name, email, role: 'student', classId, ...(level && { level }) })
}

export function updateStudentLevel(uid: string, level: Level) {
  return updateDoc(doc(db, 'users', uid), { level })
}

/**
 * Fjerner eleven fra klassen. Selve innloggingskontoen kan bare slettes i
 * Firebase Console, men uten profil slipper eleven ikke inn i appen.
 */
export function removeStudent(uid: string) {
  return deleteDoc(doc(db, 'users', uid))
}
