import { readFileSync } from 'node:fs'
import type { ReferenceTask } from './types.ts'
import { GEOMETRY_BANK, validateReferenceBank } from './validate.ts'

// Referansebanken for Geometri: 36 originale referanseoppgaver fra prosjektgruppen
// (fire fagområder × tre nivåer × tre oppgaver), importert uendret fra geometri_referanser.json.
// Lastes og kontrolleres én gang når serveren starter. Er dataene ugyldige, starter ikke serveren.

export const GEOMETRY_REFERENCE_COUNT = 36

export const geometryBankFile = new URL('./geometri_referanser.json', import.meta.url)

export function loadGeometryReferences(): ReferenceTask[] {
  const raw: unknown = JSON.parse(readFileSync(geometryBankFile, 'utf8'))
  const { errors } = validateReferenceBank(raw, GEOMETRY_REFERENCE_COUNT, GEOMETRY_BANK)
  if (errors.length) throw new Error(`Referansebanken for Geometri er ugyldig:\n- ${errors.join('\n- ')}`)
  return (raw as { references: ReferenceTask[] }).references
}

export const geometryReferences: readonly ReferenceTask[] = loadGeometryReferences()
