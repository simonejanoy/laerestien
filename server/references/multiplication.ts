import { readFileSync } from 'node:fs'
import type { ReferenceTask } from './types.ts'
import { validateReferenceBank } from './validate.ts'

// Referansebanken for multiplikasjon: 54 originale referanseoppgaver fra prosjektgruppen,
// eksportert fra referansepakken (seks PDF-er og en oversiktsfil) til multiplikasjon_referanser.json.
// Lastes og kontrolleres én gang når serveren starter. Er dataene ugyldige, starter ikke serveren.
// Planetpsyd-arkene er ikke en del av banken.

export const MULTIPLICATION_REFERENCE_COUNT = 54

export const multiplicationBankFile = new URL('./multiplikasjon_referanser.json', import.meta.url)

export function loadMultiplicationReferences(): ReferenceTask[] {
  const raw: unknown = JSON.parse(readFileSync(multiplicationBankFile, 'utf8'))
  const { errors } = validateReferenceBank(raw, MULTIPLICATION_REFERENCE_COUNT)
  if (errors.length) throw new Error(`Referansebanken for multiplikasjon er ugyldig:\n- ${errors.join('\n- ')}`)
  return (raw as { references: ReferenceTask[] }).references
}

export const multiplicationReferences: readonly ReferenceTask[] = loadMultiplicationReferences()
