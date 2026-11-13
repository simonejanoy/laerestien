import { browserStorage, type StorageLike } from '../sessions/taskStorage.ts'

// Lærerens valg av områder i en repetisjonsøkt, lagret i nettleseren per økt (som oppgavesettene). Bare
// undertema-ID-er – ingen elevopplysninger. Mangler lagring (privat vindu, blokkert), gjelder valget til siden lukkes.

const key = (sessionId: string) => `laerestien:repetisjon-omrader:${sessionId}`

/** Det lagrede valget for økta – bare områder som finnes i perioden – eller null når læreren ikke har valgt selv. */
export function loadAreaSelection(sessionId: string, allowed: readonly string[], storage: StorageLike | null = browserStorage()): string[] | null {
  try {
    const raw = storage?.getItem(key(sessionId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const skills = [...new Set(parsed.filter((s): s is string => typeof s === 'string' && allowed.includes(s)))]
    return skills.length > 0 ? skills : null
  } catch {
    return null
  }
}

/** Lagrer valget. Gir false når nettleseren ikke tillot lagring. */
export function saveAreaSelection(sessionId: string, skills: readonly string[], storage: StorageLike | null = browserStorage()) {
  try {
    if (!storage) return false
    storage.setItem(key(sessionId), JSON.stringify(skills))
    return true
  } catch {
    return false
  }
}

/** «Tilbakestill til forslaget»: glemmer lærerens valg for økta. */
export function clearAreaSelection(sessionId: string, storage: StorageLike | null = browserStorage()) {
  try {
    // Tom verdi betyr «ikke valgt selv» (StorageLike har bare getItem og setItem).
    storage?.setItem(key(sessionId), '')
  } catch {
    // Ikke kritisk – forslaget vises uansett.
  }
}
