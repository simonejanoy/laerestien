import { readFileSync } from 'node:fs'
import type { ReferenceTask } from './types.ts'
import { NUMBERS_AND_OPERATIONS_BANK, validateReferenceBank } from './validate.ts'

// Referansebanken for Tall og regning: 36 originale referanseoppgaver skrevet for Lærestien
// (fire fagområder × tre nivåer × tre oppgaver, ID-prefiks TR). Feltnavnene er tilpasset de andre bankene
// (elevtekst → studentText, fasit → solution, losningsforslag → workedSolution, visuellStotte →
// representationHint); innholdet er uendret. Områdene «addisjon-subtraksjon» og «multiplikasjon-divisjon»
// finnes allerede i Tall og plassverdi og Divisjon. De heter derfor «sammenheng-addisjon-subtraksjon» og
// «sammenheng-multiplikasjon-divisjon» her; ID-en fra referansefilen står i sourceArea.
// Lastes og kontrolleres én gang når serveren starter. Er dataene ugyldige, starter ikke serveren.

export const NUMBERS_AND_OPERATIONS_REFERENCE_COUNT = 36

export const numbersAndOperationsBankFile = new URL('./tall_og_regning_referanser.json', import.meta.url)

export function loadNumbersAndOperationsReferences(): ReferenceTask[] {
  const raw: unknown = JSON.parse(readFileSync(numbersAndOperationsBankFile, 'utf8'))
  const { errors } = validateReferenceBank(raw, NUMBERS_AND_OPERATIONS_REFERENCE_COUNT, NUMBERS_AND_OPERATIONS_BANK)
  if (errors.length) throw new Error(`Referansebanken for Tall og regning er ugyldig:\n- ${errors.join('\n- ')}`)
  return (raw as { references: ReferenceTask[] }).references
}

export const numbersAndOperationsReferences: readonly ReferenceTask[] = loadNumbersAndOperationsReferences()
