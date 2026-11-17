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
import { checkProfile, unreadableProfile } from '../features/auth/profileCheck'
import { auth, db } from '../lib/firebase'
import type { UserProfile } from '../types'
import { AuthContext, type TeacherRegistration } from './auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let stopProfile: (() => void) | undefined

    const stopAuth = onAuthStateChanged(auth, (firebaseUser) => {
      stopProfile?.()
      stopProfile = undefined
      setUser(firebaseUser)

      if (!firebaseUser) {
        setProfile(null)
        setProfileError(null)
        setLoading(false)
        return
      }

      // Lytter på profilen, så den dukker opp så snart den er lagret
      // (ved registrering) og oppdateres hvis læreren endrer f.eks. nivå.
      setLoading(true)
      stopProfile = onSnapshot(
        doc(db, 'users', firebaseUser.uid),
        (snapshot) => {
          // Mangler profilen eller noen av feltene, får brukeren vite nøyaktig hva (se profileCheck.ts).
          const check = checkProfile(firebaseUser.uid, firebaseUser.email, snapshot.exists() ? snapshot.data() : null)
          setProfile('profile' in check ? check.profile : null)
          setProfileError('problem' in check ? check.problem : null)
          setLoading(false)
        },
        (error) => {
          setProfile(null)
          setProfileError(unreadableProfile(firebaseUser.uid, (error as { code?: string }).code))
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
        title: 'Kontaktlærer',
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
    <AuthContext.Provider value={{ user, profile, profileError, loading, login, registerTeacher, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
