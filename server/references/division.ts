import { readFileSync } from 'node:fs'
import type { ReferenceTask } from './types.ts'
import { DIVISION_BANK, validateReferenceBank } from './validate.ts'

// Referansebanken for Divisjon: 36 originale referanseoppgaver fra prosjektgruppen
// (fire fagområder × tre nivåer × tre oppgaver), importert uendret fra divisjon_referanser.json.
// Lastes og kontrolleres én gang når serveren starter. Er dataene ugyldige, starter ikke serveren.

export const DIVISION_REFERENCE_COUNT = 36

export const divisionBankFile = new URL('./divisjon_referanser.json', import.meta.url)

export function loadDivisionReferences(): ReferenceTask[] {
  const raw: unknown = JSON.parse(readFileSync(divisionBankFile, 'utf8'))
  const { errors } = validateReferenceBank(raw, DIVISION_REFERENCE_COUNT, DIVISION_BANK)
  if (errors.length) throw new Error(`Referansebanken for Divisjon er ugyldig:\n- ${errors.join('\n- ')}`)
  return (raw as { references: ReferenceTask[] }).references
}

export const divisionReferences: readonly ReferenceTask[] = loadDivisionReferences()
