import type { UserProfile } from '../../types/index.ts'

// Sjekker profilen (Firestore: users/{uid}) etter innlogging, så innloggingssiden kan si nøyaktig hva som mangler.
// Ren funksjon (ingen React og ingen Firebase), så den kan testes i Node. Importene har .ts-endelse.

export type ProfileCheck = { profile: UserProfile } | { problem: string }

const ROLES = ['student', 'teacher']

/**
 * `data` er dokumentet users/{uid}, eller null når det ikke finnes. En profil trenger name, role («student» eller
 * «teacher») og classId – ellers vet ikke appen hvem brukeren er, eller hvilken klasse hen hører til.
 */
export function checkProfile(uid: string, email: string | null | undefined, data: Record<string, unknown> | null): ProfileCheck {
  const where = `users/${uid}`
  if (!data) {
    return {
      problem:
        `Innloggingen virker${email ? ` for ${email}` : ''}, men kontoen har ingen profil i Firestore. ` +
        `Dokumentet ${where} må finnes med feltene name, role og classId.`,
    }
  }
  const missing: string[] = []
  if (typeof data.name !== 'string' || data.name.trim() === '') missing.push('name (f.eks. «Nora Teigen»)')
  if (typeof data.role !== 'string' || data.role.trim() === '') missing.push('role («student» eller «teacher»)')
  if (typeof data.classId !== 'string' || data.classId.trim() === '') missing.push('classId (f.eks. «4A»)')
  if (missing.length > 0) return { problem: `Profilen ${where} mangler ${missing.join(', ')}.` }
  if (!ROLES.includes(data.role as string)) {
    return { problem: `Profilen ${where} har role «${String(data.role)}». Den må være «student» eller «teacher».` }
  }
  if (data.level !== undefined && data.level !== 1 && data.level !== 2 && data.level !== 3) {
    return { problem: `Profilen ${where} har level «${String(data.level)}». Den må være tallet 1, 2 eller 3 (eller tas bort).` }
  }
  // Mangler e-posten i profilen, brukes e-posten fra innloggingen (så eleven kobles til klasselista på e-post).
  const profileEmail = typeof data.email === 'string' && data.email.trim() ? data.email : email ?? undefined
  return { profile: { ...(data as Omit<UserProfile, 'uid'>), uid, ...(profileEmail && { email: profileEmail }) } }
}

/**
 * E-posten som skal skrives inn i elevprofilen, eller null. Læreren kobler elevkontoen til raden i klasselista på e-post
 * (se buildRoster i live/liveProgress.ts), men ser bare profilen i Firestore – ikke innloggingen. Mangler e-posten i
 * profilen (eller den er en annen enn innloggingen), skriver eleven e-posten fra innloggingen inn selv. Navnet i
 * profilen endres aldri.
 */
export function emailToSync(data: Record<string, unknown> | null, authEmail: string | null | undefined): string | null {
  if (!data || data.role !== 'student' || !authEmail?.trim()) return null
  const stored = typeof data.email === 'string' ? data.email.trim().toLowerCase() : ''
  return stored === authEmail.trim().toLowerCase() ? null : authEmail.trim()
}

/** Når profilen ikke kunne leses (f.eks. Firestore-reglene avviste det). */
export function unreadableProfile(uid: string, code: string | undefined) {
  return code === 'permission-denied'
    ? `Fikk ikke lov til å lese profilen users/${uid}. Sjekk at firestore.rules er publisert i Firebase.`
    : `Fikk ikke lest profilen users/${uid}${code ? ` (${code})` : ''}. Sjekk nettet og prøv igjen.`
}
