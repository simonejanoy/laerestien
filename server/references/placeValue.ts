import { readFileSync } from 'node:fs'
import type { ReferenceTask } from './types.ts'
import { PLACE_VALUE_BANK, validateReferenceBank } from './validate.ts'

// Referansebanken for Tall og plassverdi: 45 originale referanseoppgaver fra prosjektgruppen
// (fem fagområder × tre nivåer × tre oppgaver), importert uendret fra tall_og_plassverdi_referanser.json.
// Lastes og kontrolleres én gang når serveren starter. Er dataene ugyldige, starter ikke serveren.
// Avrunding er ikke med i temaet nå.

export const PLACE_VALUE_REFERENCE_COUNT = 45

export const placeValueBankFile = new URL('./tall_og_plassverdi_referanser.json', import.meta.url)

export function loadPlaceValueReferences(): ReferenceTask[] {
  const raw: unknown = JSON.parse(readFileSync(placeValueBankFile, 'utf8'))
  const { errors } = validateReferenceBank(raw, PLACE_VALUE_REFERENCE_COUNT, PLACE_VALUE_BANK)
  if (errors.length) throw new Error(`Referansebanken for Tall og plassverdi er ugyldig:\n- ${errors.join('\n- ')}`)
  return (raw as { references: ReferenceTask[] }).references
}

export const placeValueReferences: readonly ReferenceTask[] = loadPlaceValueReferences()
