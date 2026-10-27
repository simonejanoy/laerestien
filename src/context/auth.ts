import type { User } from 'firebase/auth'
import { createContext } from 'react'
import type { UserProfile } from '../types'

export interface TeacherRegistration {
  name: string
  email: string
  password: string
  classId: string
  /** Lærerkoden skolen har fått – sjekkes av sikkerhetsreglene i Firestore. */
  teacherCode: string
}

export interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  registerTeacher: (registration: TeacherRegistration) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
