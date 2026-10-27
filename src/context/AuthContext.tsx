import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { useEffect, useState, type ReactNode } from 'react'
import { auth, db } from '../lib/firebase'
import type { UserProfile } from '../types'
import { AuthContext, type TeacherRegistration } from './auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let stopProfile: (() => void) | undefined

    const stopAuth = onAuthStateChanged(auth, (firebaseUser) => {
      stopProfile?.()
      stopProfile = undefined
      setUser(firebaseUser)

      if (!firebaseUser) {
        setProfile(null)
        setLoading(false)
        return
      }

      // Lytter på profilen, så den dukker opp så snart den er lagret
      // (ved registrering) og oppdateres hvis læreren endrer f.eks. nivå.
      setLoading(true)
      stopProfile = onSnapshot(
        doc(db, 'users', firebaseUser.uid),
        (snapshot) => {
          setProfile(snapshot.exists() ? ({ uid: firebaseUser.uid, ...snapshot.data() } as UserProfile) : null)
          setLoading(false)
        },
        () => {
          setProfile(null)
          setLoading(false)
        },
      )
    })

    return () => {
      stopProfile?.()
      stopAuth()
    }
  }, [])

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const registerTeacher = async ({ name, email, password, classId, teacherCode }: TeacherRegistration) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password)
    try {
      await setDoc(doc(db, 'users', credential.user.uid), {
        name,
        email,
        role: 'teacher',
        title: 'Lærer',
        classId,
        teacherCode,
      })
    } catch (error) {
      // Feil lærerkode (avvist av reglene): fjern kontoen igjen, så e-posten kan brukes på nytt.
      await deleteUser(credential.user).catch(() => {})
      throw error
    }
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, registerTeacher, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
