import type { IncomingMessage } from 'node:http'
import { HttpError } from './errors.ts'

// Sjekker at forespørselen kommer fra en innlogget lærer, uten firebase-admin:
// Firebase ID-tokenet sendes videre til Firestore sitt REST-API, som avviser ugyldige
// tokens. Vi leser lærerens egen profil (users/{uid}) – det tillater reglene bare for
// eieren av tokenet.

export interface Teacher {
  uid: string
  classId: string
}

const projectId = () => process.env.VITE_FIREBASE_PROJECT_ID

/** Gyldige tokens huskes en kort stund, så hver melding ikke trenger et ekstra oppslag. */
const cache = new Map<string, { teacher: Teacher; until: number }>()
const CACHE_MS = 5 * 60_000

function claimsOf(token: string): { sub?: string; aud?: string; exp?: number } {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
  } catch {
    return {}
  }
}

export async function requireTeacher(req: IncomingMessage): Promise<Teacher> {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new HttpError(401, 'Du må være logget inn for å bruke AI-assistenten.')

  const cached = cache.get(token)
  if (cached && cached.until > Date.now()) return cached.teacher

  const project = projectId()
  if (!project) throw new Error('VITE_FIREBASE_PROJECT_ID mangler i miljøvariablene (.env.local).')

  // Rask sjekk av innholdet. Signaturen kontrolleres av Firestore under.
  const { sub, aud, exp } = claimsOf(token)
  if (!sub || aud !== project || !exp || exp * 1000 < Date.now()) {
    throw new HttpError(401, 'Innloggingen din er utløpt. Logg inn på nytt.')
  }

  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/users/${sub}`
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401 || response.status === 403) {
    throw new HttpError(401, 'Innloggingen din er ikke gyldig. Logg inn på nytt.')
  }
  if (!response.ok) throw new Error(`Firestore svarte ${response.status} ved oppslag av lærerprofil`)

  const doc = (await response.json()) as { fields?: Record<string, { stringValue?: string }> }
  const role = doc.fields?.role?.stringValue
  const classId = doc.fields?.classId?.stringValue ?? ''
  if (role !== 'teacher') throw new HttpError(403, 'AI-assistenten er bare for lærere.')

  const teacher = { uid: sub, classId }
  cache.set(token, { teacher, until: Math.min(Date.now() + CACHE_MS, exp * 1000) })
  return teacher
}

/** Elevopplysninger sendes bare for elever i lærerens egen klasse. */
export function requireOwnClass(teacher: Teacher, classId: string | undefined) {
  if (!classId || classId !== teacher.classId) {
    throw new HttpError(
      403,
      'Du har ikke tilgang til elever i denne klassen. Elevopplysninger kan bare brukes for din egen klasse.',
    )
  }
}
